# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

# Use Ubuntu 24.04 as the base image
FROM ubuntu:24.04

# Update package lists and install necessary packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends

WORKDIR /usr/src/app

# Copy the rest of the source files into the image.
COPY . .

RUN chown ubuntu /usr/src/app/gpp

# Expose the port that the application listens on.
EXPOSE 40720

# Run the application as a non-root user.
USER ubuntu

# Run the application.
CMD ./tremded +set fs_homepath /usr/src/app +set dedicated 2 +exec ${SERVER_CONFIG}  +set sv_master1 34.224.65.57
#CMD sleep 1000
