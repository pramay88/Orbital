# Orbital

**A self-hosted home server for managing files, monitoring system resources, and streaming media across your local network.**

Orbital is a personal infrastructure management platform that transforms a computer into a centralized home server. It provides a web-based interface for managing filesystem operations, monitoring system health, and accessing media through a modular client-server architecture.

## Features

- **System Monitoring:** Track CPU, memory, disk usage, network information, and system uptime.
- **File Management:** Browse directories, upload, download, rename, delete, and create files and folders.
- **Media Streaming:** Stream large media files efficiently with HTTP range request support.
- **Performance:** Bounded-memory file streaming and process management with PM2.
- **API Architecture:** Modular backend with RESTful endpoints and separated frontend and server applications.

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, TypeScript, Hono |
| Testing | Vitest |
| Load Testing | k6 |
| Process Management | PM2 |

## Getting Started

**Prerequisites:** Node.js (LTS), npm, and Git.

```bash
# Clone the repository
Clone the Repo
cd orbital

# Install dependencies
npm install

# Start the backend
npm run dev:server

# Start the frontend (in another terminal)
npm run dev:web
```

## Security

Orbital includes filesystem path validation, HTTP security headers, and controlled file streaming. Authentication and additional security hardening are under development.

**Note:** Orbital is currently intended for trusted local-network environments. Public internet exposure is not recommended until authentication and security controls are completed.
