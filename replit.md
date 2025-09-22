# Overview

This is a Minecraft AFK bot built with Node.js that connects to Minecraft servers to maintain an active presence. The bot prevents AFK kicks by performing various automated actions like moving, jumping, sneaking, and rotating. It supports both offline and Microsoft/Mojang accounts, includes auto-authentication for cracked servers, and can send periodic chat messages. The bot also features automatic reconnection capabilities and position targeting using pathfinding algorithms.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Bot Framework
- **Main Technology**: Node.js with the `mineflayer` library for Minecraft protocol handling
- **Bot Management**: Single bot instance with proper cleanup mechanisms to prevent memory leaks
- **Configuration**: JSON-based configuration system (`settings.json`) for easy customization

## Anti-AFK System
- **Movement Engine**: Uses `mineflayer-pathfinder` for intelligent navigation and movement
- **Action Types**: Configurable anti-AFK actions including sneaking, jumping, rotating, and moving
- **Timing**: Interval-based system to perform actions at regular intervals

## Authentication Architecture
- **Account Types**: Supports both offline accounts and Microsoft/Mojang authentication
- **Auto-Auth**: Built-in support for cracked server authentication plugins
- **Security**: Handles login credentials securely through configuration

## Communication Features
- **Chat System**: Automated chat message sending with configurable intervals
- **Chat Logging**: Real-time chat monitoring and logging capabilities
- **Message Rotation**: Supports multiple predefined messages with repeat functionality

## Reliability & Monitoring
- **Auto-Reconnect**: Automatic reconnection with configurable delay on disconnection, with deduplication to prevent multiple reconnect attempts
- **Web Server**: Express.js server for health monitoring and keep-alive functionality
- **Error Handling**: Comprehensive error handling with graceful cleanup and proper resource management
- **Resource Management**: Active interval tracking and proper resource cleanup to prevent memory leaks
- **Timeout Management**: Promise-based operations with configurable timeouts to prevent hanging
- **Graceful Shutdown**: Proper cleanup on process termination (SIGINT/SIGTERM)
- **Connection Stability**: Robust handling of connection errors with smart retry logic

## Deployment Architecture
- **Platform**: Designed for cloud deployment (Replit, Heroku-style platforms)
- **Port Management**: Dynamic port assignment with fallback to port 5000
- **Process Management**: Single-process architecture with proper signal handling

# External Dependencies

## Core Minecraft Libraries
- **mineflayer**: Primary Minecraft bot framework for protocol handling
- **mineflayer-pathfinder**: Pathfinding and movement capabilities
- **minecraft-data**: Minecraft version and data compatibility

## Web Framework
- **express**: Lightweight web server for health monitoring

## Authentication Services
- **Microsoft/Mojang APIs**: For legitimate account authentication
- **Custom Authentication**: Support for cracked server authentication plugins

## Platform Services
- **Cloud Hosting**: Designed for platforms like Replit, Heroku, or similar
- **Environment Variables**: Uses PORT environment variable for deployment flexibility

## Game Server Integration
- **Minecraft Servers**: Compatible with versions 1.8 through 1.21.3
- **Protocol Support**: Handles various server configurations and plugins