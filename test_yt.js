import { exec } from 'child_process';
exec('.\\yt-dlp.exe --dump-json --no-playlist https://www.youtube.com/watch?v=XO7jXxtBR5U', (err, stdout, stderr) => {
    if (err) {
        console.error(err);
        return;
    }
    const data = JSON.parse(stdout);
    console.log(JSON.stringify({
        uploader: data.uploader,
        uploader_id: data.uploader_id,
        channel: data.channel,
        channel_id: data.channel_id,
        channel_url: data.channel_url
    }, null, 2));
});
