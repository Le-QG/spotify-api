class Spotify {
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;
    accessToken: string;

    constructor({ clientId, clientSecret, redirectUri }: {
        clientId: string;
        clientSecret: string;
        redirectUri: string;
    }) {
        if (!clientId || !clientSecret || !redirectUri) throw new Error('Missing Spotify credentials');
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    getAccessToken = async () => {
        const res = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'client_credentials',
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        })

        const data: { access_token: string } = await res.json();
        this.setAccessToken(data.access_token);
        return data.access_token as string;
    }

    setAccessToken = (accessToken: string) => {
        this.accessToken = accessToken;
    }

    getPlaylist = async (playlistId: string) => {
        const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: {
                Authorization: 'Bearer ' + this.accessToken,
                'Content-Type': 'application/json',
            },
        })

        const data = await res.json();
        return data;
    }

    getPlaylistTracks = async (playlistId: string) => {
        const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
            headers: {
                Authorization: 'Bearer ' + this.accessToken,
                'Content-Type': 'application/json',
            },
        })

        const data = await res.json();
        return data;
    }

    getTracks = async (tracksId: string[]) => {
        const res = await fetch(`https://api.spotify.com/v1/tracks?ids=${tracksId.join(',')}`, {
            headers: {
                Authorization: 'Bearer ' + this.accessToken,
                'Content-Type': 'application/json',
            },
        })

        const data = await res.json();
        return data;
    }
}

export const spotify = new Spotify({
    clientId: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
    redirectUri: 'http://localhost:8888/callback'
});