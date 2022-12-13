import SpotifyWebApi from "spotify-web-api-node";
export const spotifyApi = new SpotifyWebApi({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: 'http://localhost:8888/callback'
});

spotifyApi.setRefreshToken(process.env.REFRESH_TOKEN);