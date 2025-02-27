# Docker Network Troubleshooting Guide

## Recent Changes to Dockerfile

The Dockerfile has been modified to address network connectivity issues when building the Docker image. The following changes were made:

1. **Added retry logic for apt-get commands**:
   - Configured apt to retry failed downloads up to 10 times
   - Implemented a loop to retry the entire installation process up to 3 times

2. **Configured alternative Debian mirrors**:
   - Changed from the default `deb.debian.org` to `ftp.us.debian.org` for main packages
   - Using the official `security.debian.org` for security updates
   - These alternative mirrors may have better connectivity from your location

3. **Increased connection timeouts**:
   - Extended HTTP and HTTPS timeouts to 120 seconds
   - Gives more time for package downloads to complete

## Common Docker Network Issues

### Connection Timeouts

If you see errors like:
```
Unable to connect to deb.debian.org:http: [IP: 199.232.18.132 80]
Connection timed out
```

This indicates that your Docker build process cannot reach the Debian package repositories. This could be due to:

1. **Network connectivity issues** - Check your internet connection
2. **Firewall or proxy restrictions** - Your network might be blocking these connections
3. **DNS resolution problems** - Docker might not be able to resolve the repository hostnames
4. **Repository server issues** - The Debian mirrors might be experiencing problems

### Solutions to Try

If you continue to experience network issues when building Docker images:

#### 1. Configure Docker to use a specific DNS server

Create or edit `/etc/docker/daemon.json`:
```json
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}
```
Then restart Docker: `sudo systemctl restart docker`

#### 2. Use a different mirror in your Dockerfile

Edit the Dockerfile to use mirrors that work better in your region:
```dockerfile
RUN echo 'deb http://mirror.example.com/debian bookworm main' > /etc/apt/sources.list
```

Some reliable mirrors to try:
- North America: `ftp.us.debian.org`, `mirror.csclub.uwaterloo.ca`
- Europe: `ftp.de.debian.org`, `ftp.uk.debian.org`
- Asia: `ftp.jp.debian.org`, `mirror.rise.ph`

#### 3. Configure a proxy for Docker

If you're behind a corporate firewall, configure Docker to use your proxy:

```bash
# In your ~/.docker/config.json
{
  "proxies": {
    "default": {
      "httpProxy": "http://proxy.example.com:8080",
      "httpsProxy": "http://proxy.example.com:8080",
      "noProxy": "localhost,127.0.0.1"
    }
  }
}
```

Or set environment variables before building:
```bash
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
docker-compose build
```

#### 4. Use a VPN

If your ISP or network is blocking connections to certain servers, using a VPN might help bypass these restrictions.

#### 5. Build with a different base image

Consider using a different base image that already includes the dependencies you need, reducing the number of packages that need to be downloaded during the build.

## Using the rebuild-docker.sh Script

The provided `rebuild-docker.sh` script will:

1. Clean up previous Docker containers and images
2. Build the Docker container with the updated configuration
3. Provide feedback on the build process

To use it:
```bash
./rebuild-docker.sh
```

If the build is successful, you can start the container with:
```bash
docker-compose up
```

## Additional Resources

- [Docker Networking Documentation](https://docs.docker.com/network/)
- [Debian Mirror List](https://www.debian.org/mirror/list)
- [Docker Build Command Reference](https://docs.docker.com/engine/reference/commandline/build/)
