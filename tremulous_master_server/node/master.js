var _ = require('underscore');
var fs = require('fs');
var https = require('https');
var logger = require('winston');
var opt = require('optimist');
var url = require('url');
var os = require('os'); // Import the 'os' module

var WebSocketClient = require('ws');
var WebSocketServer = require('ws').Server;
var Dgram = require('dgram');

var argv = require('optimist')
	.describe('config', 'Location of the configuration file').default('config', './config.json')
    .describe('websocket_port', 'Port for master server to use for communication with the web client').default('websocket_port', '30700')
    .describe('udp_port', 'Port for master server to use for communication with the game servers').default('udp_port', '40700')
	.describe('address', 'Override local IP address').default('address', 'localhost')
	.argv;

if (argv.h || argv.help) {
	opt.showHelp();
	return;
}

logger.cli();
logger.level = 'debug';

//var config = loadConfig(argv.port);
var config = {
    websocket_port: argv.websocket_port,
	udp_port: argv.udp_port,
	address: argv.address,
	privateKey: '/etc/letsencrypt/live/master.tremulous.online/privkey.pem',
	certificate: '/etc/letsencrypt/live/master.tremulous.online/fullchain.pem',
};
var clients = [];
var servers = {};
var pruneInterval = 350 * 1000;

const ip_to_host = {
	"85.215.55.189": "eu-1.game.tremulous.online",
	"3.107.204.52": "au-1.game.tremulous.online",
	"192.9.134.0": "us-1.game.tremulous.online",
}

function formatOOB(data) {
	var str = '\xff\xff\xff\xff' + data + '\x00';

	var buffer = new ArrayBuffer(str.length);
	var view = new Uint8Array(buffer);

	for (var i = 0; i < str.length; i++) {
		view[i] = str.charCodeAt(i);
	}

	return buffer;
}

function stripOOB(buffer) {
	var view = new DataView(buffer);

	if (view.getInt32(0) !== -1) {
		return null;
	}

	var str = '';
	for (var i = 4 /* ignore leading -1 */; i < buffer.byteLength - 1 /* ignore trailing \0 */; i++) {
		var c = String.fromCharCode(view.getUint8(i));
		str += c;
	}

	return str;
}

function parseInfoString(str) {
	var data = {};

	var split = str.split('\\');
	// throw when split.length isn't even?

	for (var i = 0; i < split.length - 1; i += 2) {
		var key = split[i];
		var value = split[i+1];
		data[key] = value;
	}
}

/**********************************************************
 *
 * messages
 *
 **********************************************************/
var CHALLENGE_MIN_LENGTH = 9;
var CHALLENGE_MAX_LENGTH = 12;

function buildChallenge() {
	var challenge = '';
	var length = CHALLENGE_MIN_LENGTH - 1 +
		parseInt(Math.random() * (CHALLENGE_MAX_LENGTH - CHALLENGE_MIN_LENGTH + 1), 10);

	for (var i = 0; i < length; i++) {
		var c;
		do {
			c = Math.floor(Math.random() * (126 - 33 + 1) + 33); // -> 33 ... 126 (inclusive)
		} while (c === '\\'.charCodeAt(0) || c === ';'.charCodeAt(0) || c === '"'.charCodeAt(0) || c === '%'.charCodeAt(0) || c === '/'.charCodeAt(0));

		challenge += String.fromCharCode(c);
	}

	return challenge;
}

function handleGetServers(conn, data) {
	logger.info(conn.addr + ':' + conn.port + ' ---> getservers');

	// sendGetServersResponse(conn, servers);
	sendGetServersWebResponse(conn, servers);
}

function handleHeartbeat(conn, data) {
	logger.info(conn.addr + ':' + conn.port + ' ---> heartbeat');

	sendGetInfo(conn);
}

function handleHeartbeatUDP(udp, rinfo, data) {
	logger.info(rinfo.addr + ':' + rinfo.port + ' ---> heartbeat');

	sendGetInfoUDP(udp, rinfo);
}

function handleInfoResponse(conn, data) {
	logger.info(conn.addr + ':' + conn.port + ' ---> infoResponse');

	var info = parseInfoString(data);
	// TODO validate data

	updateServer(conn.addr, conn.port);
}

function handleInfoResponseUDP(udp, rinfo, data) {
	logger.info(rinfo.address + ':' + rinfo.port + ' ---> infoResponse');

	var info = parseInfoString(data);
	// TODO validate data

	updateServer(rinfo.address, rinfo.port);
}


function sendGetInfo(conn) {
	var challenge = buildChallenge();

	logger.info(conn.addr + ':' + conn.port + ' <--- getinfo with challenge \"' + challenge + '\"');

	var buffer = formatOOB('getinfo ' + challenge);
	conn.socket.send(buffer, { binary: true });
}

function sendGetInfoUDP(udp, rinfo) {
	var challenge = buildChallenge();

	logger.info(rinfo.address + ':' + rinfo.port + ' <--- getinfo with challenge \"' + challenge + '\"');

	var buffer = formatOOB('getinfo ' + challenge);
	udp.send(Buffer.from(buffer), rinfo.port, rinfo.address);
}

function sendGetServersResponse(conn, servers) {
	var msg = 'getserversResponse';
	console.log(servers)
	for (var id in servers) {
		if (!servers.hasOwnProperty(id)) {
			continue;
		}
		var server = servers[id];
		var octets = server.addr.split('.').map(function (n) {
			return parseInt(n, 10);
		});
		msg += '\\';
		msg += String.fromCharCode(octets[0] & 0xff);
		msg += String.fromCharCode(octets[1] & 0xff);
		msg += String.fromCharCode(octets[2] & 0xff)
		msg += String.fromCharCode(octets[3] & 0xff);
		msg += String.fromCharCode((server.port & 0xff00) >> 8);
		msg += String.fromCharCode(server.port & 0xff);
	}
	msg += '\\EOT';

	logger.info(conn.addr + ':' + conn.port + ' <--- getserversResponse with ' + Object.keys(servers).length + ' server(s)');

	var buffer = formatOOB(msg);
	conn.socket.send(buffer, { binary: true });
}

function sendGetServersWebResponse(conn, servers) {
	var msg = 'getserverswebResponse';
	console.log(servers)

	for (var id in servers) {
		if (!servers.hasOwnProperty(id)) {
			continue;
		}

		var server = servers[id];
		if (!(server.addr in ip_to_host)) {
			logger.info('Cannot find address ' + server.addr + ' in ' + JSON.stringify(ip_to_host));
			continue
		}
		
		msg += '\\' + ip_to_host[server.addr] + ':'
		msg += String.fromCharCode((server.port & 0xff00) >> 8);
		msg += String.fromCharCode(server.port & 0xff);
	}
	msg += '\\EOT';

	logger.info(conn.addr + ':' + conn.port + ' <--- getserverswebResponse with ' + Object.keys(servers).length + ' server(s)');

	var buffer = formatOOB(msg);
	conn.socket.send(buffer, { binary: true });
}


/**********************************************************
 *
 * servers
 *
 **********************************************************/
function serverid(addr, port) {
	return addr + ':' + port;
}

function updateServer(addr, port) {
	var id = serverid(addr, port);
	var server = servers[id];
	if (!server) {
		server = servers[id] = { addr: addr, port: port };
	}
	server.lastUpdate = Date.now();

	// send partial update to all clients
	for (var i = 0; i < clients.length; i++) {
		// sendGetServersResponse(clients[i], { id: server });
		sendGetServersWebResponse(clients[i], { id: server });
	}
}

function removeServer(id) {
	var server = servers[id];

	delete servers[id];

	logger.info(server.addr + ':' + server.port + ' timed out, ' + Object.keys(servers).length + ' server(s) currently registered');
}

function pruneServers() {
	var now = Date.now();

	for (var id in servers) {
		if (!servers.hasOwnProperty(id)) {
			continue;
		}

		var server = servers[id];
		var delta = now - server.lastUpdate;

		if (delta > pruneInterval) {
			removeServer(id);
		}
	}
}

/**********************************************************
 *
 * clients
 *
 **********************************************************/
function handleSubscribe(conn) {
	addClient(conn);

	// send all servers upon subscribing
	// sendGetServersResponse(conn, servers);
	sendGetServersWebResponse(conn, servers);
}

function addClient(conn) {
	var idx = clients.indexOf(conn);

	if (idx !== -1) {
		return;  // already subscribed
	}

	logger.info(conn.addr + ':' + conn.port + ' ---> subscribe');

	clients.push(conn);
}

function removeClient(conn) {
	var idx = clients.indexOf(conn);
	if (idx === -1) {
		return;  // conn may have belonged to a server
	}

	var conn = clients[idx];

	logger.info(conn.addr + ':' + conn.port + ' ---> unsubscribe');

	clients.splice(idx, 1);
}

/**********************************************************
 *
 * main
 *
 **********************************************************/
function getRemoteAddress(ws, req) {
	// by default, check the underlying socket's remote address
	var address = ws._socket.remoteAddress;
	if (address.startsWith('localhost') || address.startsWith('127.0.0.1')) {
		address = config.address
	}

	// if this is an x-forwarded-for header (meaning the request has been proxied), use it
	if (req.headers['x-forwarded-for']) {
		address = req.headers['x-forwarded-for'];
	}

	return address;
}

function getRemotePort(ws, req) {
	var port = ws._socket.remotePort;

	if (req.headers['x-forwarded-port']) {
		port = req.headers['x-forwarded-port'];
	}

	return port;
}

function connection(ws, req) {
	this.socket = ws;
	this.addr = getRemoteAddress(ws, req);
	this.port = getRemotePort(ws, req);
	logger.info("Received websocket connection request from " + this.addr + ":" + this.port);
}

function loadConfig(configPath) {
	var config = {
		port: 30700
	};

	/*try {
		console.log('Loading config file from ' + configPath + '..');
		var data = require(configPath);
		_.extend(config, data);
	} catch (e) {
		console.log('Failed to load config', e);
	}*/

	return config;
}

(function main() {
    const privateKey = fs.readFileSync(config.privateKey, 'utf8');
    const certificate = fs.readFileSync(config.certificate, 'utf8');

	var server = https.createServer({
		key: privateKey, 
		cert: certificate
	});

	var wss = new WebSocketServer({
		server: server
	});

	const udp = Dgram.createSocket('udp4'); // 'udp4' for IPv4, 'udp6' for IPv6

    udp.bind(config.udp_port, () => {
        console.log('master server (UDP) listening on port ' + config.udp_port);
    });

    udp.on('message', (buffer, rinfo) => {
        console.log(`Received UDP connection request from: ${rinfo.address}:${rinfo.port}`);
		var view = Uint8Array.from(buffer);
		var buffer = view.buffer;
        // Optionally, send a response back to the client
		var msg = stripOOB(buffer);
		if (!msg) {
			removeClient(rinfo);
			return;
		}

		if (msg.indexOf('heartbeat ') === 0) {
			handleHeartbeatUDP(udp, rinfo, msg.substr(10));
		} else if (msg.indexOf('infoResponse\n') === 0) {
			handleInfoResponseUDP(udp, rinfo, msg.substr(13));
		} else {
			console.error('unexpected message "' + msg + '"');
		}
	});

	wss.on('connection', function (ws, req) {
		var conn = new connection(ws, req);
		var first = true;

		ws.on('message', function (buffer, flags) {
			//if (!flags.binary) {
			//	return;
			//}

			// node Buffer to ArrayBuffer
			var view = Uint8Array.from(buffer);
			var buffer = view.buffer;

			// check to see if this is emscripten's port identifier message
			var wasfirst = first;
			first = false;
			if (wasfirst &&
					view.byteLength === 10 &&
					view[0] === 255 && view[1] === 255 && view[2] === 255 && view[3] === 255 &&
					view[4] === 'p'.charCodeAt(0) && view[5] === 'o'.charCodeAt(0) && view[6] === 'r'.charCodeAt(0) && view[7] === 't'.charCodeAt(0)) {
					conn.port = ((view[8] << 8) | view[9]);
					return;
			}

			var msg = stripOOB(buffer);
			if (!msg) {
				removeClient(conn);
				return;
			}

			if (msg.indexOf('getserversExt ') === 0) {
				handleGetServers(conn, msg.substr(11));
			} else if (msg.indexOf('heartbeat ') === 0) {
				handleHeartbeat(conn, msg.substr(10));
			} else if (msg.indexOf('infoResponse\n') === 0) {
				handleInfoResponse(conn, msg.substr(13));
			} else if (msg.indexOf('subscribe') === 0) {
				handleSubscribe(conn);
			} else {
				console.error('unexpected message "' + msg + '"');
			}
		});

		ws.on('error', function (err) {
			removeClient(conn);
		});

		ws.on('close', function () {
			removeClient(conn);
		});
	});

	// listen only on 0.0.0.0 to force ipv4
	server.listen(config.websocket_port, '0.0.0.0',  function() {
			console.log('master server (Websocket) listening on port ' + server.address().port);
	});

	setInterval(pruneServers, pruneInterval);
})();
