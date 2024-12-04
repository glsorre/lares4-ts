# Description

The purpose of this project is to offer to the community a typescript package to interact with Ksenia Lares 4 home automation systems.

# Status

The current status is definitely WIP. Basic entities like lights, covers, domus expansion module should be read and written properly.

# Tech stack

The package is very minimal it is based on the following libraries:

- [winston](https://github.com/winstonjs/winston) to log;
- [ws](https://github.com/websockets/ws) to interact with the ksenia websocket;
- [mnasyrov/pubsub](https://github.com/mnasyrov/pubsub) to emit messages to consumers.

I also would like to thank @gvisconti1983 for the ksenia crc functions contained in [gvisconti1983/lares-hass](https://github.com/gvisconti1983/lares-hass).

# Design

I followed the following principles developing the library:

1. to not mess with your alarm and will manage only home automation entities (sensors, lights, covers, etc.);
2. to respect ksenia lares 4 entities logic as much as possible.

# Features

1. Read and write home automation entities;
2. Update on the status of home automation entities;
3. Autodiscover entities;

# Roadmap

- [X] Read and write home automation basic entities;
- [X] Update on the status of home automation basic entities;
- [X] Autodiscover entities;
- [X] Publish on github;
- [X] Publish on npmjs;
- [ ] Example application;
- [ ] Full documentation;
- [ ] Cover entire ksenia ecosystem.
