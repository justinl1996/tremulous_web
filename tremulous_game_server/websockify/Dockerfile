# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

FROM python:3

# Update the package list and install Git
RUN apt-get update && apt-get install -y git

RUN pip install git+https://github.com/justinl1996/websockify.git

# Expose the port that the application listens on.
EXPOSE 40720

# Run the application.
CMD websockify 30720 127.0.0.1:40720 --cert=/etc/letsencrypt/live/${SERVER_NAME}/cert.pem --key=/etc/letsencrypt/live/${SERVER_NAME}/privkey.pem -v