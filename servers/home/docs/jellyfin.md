# Jellyfin

Media server for movies, TV shows, and music.

## Features

- Stream to any device
- Live TV & DVR support
- Hardware transcoding
- Multiple user profiles
- Mobile apps

## Access

Web UI: `https://movies.${DOMAIN}`

## Clients

- [Official apps](https://jellyfin.org/downloads/) for all platforms
- Android TV, Roku, Fire TV, Apple TV supported

## Media Organization

```
/media/
  movies/
    Movie Name (Year)/
      Movie Name (Year).mkv
  tv/
    Show Name/
      Season 01/
        Show Name S01E01.mkv
```

See [Jellyfin naming guide](https://jellyfin.org/docs/general/server/media/shows/).

## Hardware Acceleration

Configured for Intel QuickSync. See [Jellyfin HWA docs](https://jellyfin.org/docs/general/administration/hardware-acceleration/).

## Resources

- [Jellyfin Documentation](https://jellyfin.org/docs/)
