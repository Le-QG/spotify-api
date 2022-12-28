# spotify-api
Simple API to get audio files links from a given Spotify playlist<br/>
> This is a simple service made for us to use in our, currently private, mobile app

## Routes
**GET** /api/spotify

|Params | Descriptions|Optional|
|-|-|-|
|`playlistId`| The playlist ID to retrieve tracks from|true|

Response sample
```json
[
  {
    "id": "5ulYM7FmzzuiHLDsbGZmf9",
    "name": "departure! -second version- (TVサイズ)",
    "preview_url": "https://p.scdn.co/mp3-preview/5c2f42e5e60d43434bf62b95794a29ea3b4d34c1?cid=cc194f96d2284dba8beb8bfa6345ae53",
    "artists": "Masatoshi Ono"
  },
  {
    "id": "6dGnYIeXmHdcikdzNNDMm2",
    "name": "Here Comes The Sun - Remastered 2009",
    "preview_url": "https://p.scdn.co/mp3-preview/54cc460f2c430b83b018f540c8a8c33539c1c393?cid=cc194f96d2284dba8beb8bfa6345ae53",
    "artists": "The Beatles"
  }
]
```
