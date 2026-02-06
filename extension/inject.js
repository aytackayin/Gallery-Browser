// Bu script sayfanın "Main World"ünde çalışır, yani window.ytplayer'a erişebilir.
(function () {
    console.log("Gallery Ext: Injector running...");

    function checkPlayer() {
        const player = document.getElementById('movie_player');
        if (player && player.getPlayerResponse) {
            const data = player.getPlayerResponse();
            window.postMessage({ type: "GALLERY_YT_DATA", data: data }, "*");
            return true;
        }

        if (window.ytInitialPlayerResponse) {
            window.postMessage({ type: "GALLERY_YT_DATA", data: window.ytInitialPlayerResponse }, "*");
            return true;
        }

        return false;
    }

    if (!checkPlayer()) {
        setTimeout(checkPlayer, 2000);
        setTimeout(checkPlayer, 5000);
    }
})();
