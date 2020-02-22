window.addEventListener('load',function(){init()});


var playButton;
var player;

var defaultProtos = {
    http: {
        url: "./video/h264_baseline_aac.mp4",  
        waitLength : 512 * 1024,
        stream: false,
    },
    http2: {
        url: "./video/h264_high_aac.mp4",  
        waitLength : 512 * 1024,
        stream: false,
    },
    http3: {
        url: "./video/h264_high_noaudio.mp4",  
        waitLength : 512 * 1024,
        stream: false,
    },
    http4: {
        url: "./video/h265_high.mp4",  //"https://roblin.cn/wasm/video/h265_high.mp4"
        waitLength : 512 * 1024,
        stream: false,
    },
    ws: {
        url: "wss://roblin.cn/wss/h265_high.mp4",
        waitLength : 512 * 1024,
        stream: false,
    },
    httpFlv: {
        url: "https://data.vod.itc.cn/bee/qf/wasm?tok=e4da89d923e4e2af4d622a0edb717f88827b422a&format=flv&direct=1",
        waitLength : 512 * 1024,
        stream: true,
    }
};

function init(){
    console.log("initializing...")
    playButton = document.getElementById("btnPlayVideo");
    btnStopVideo=document.getElementById("btnStopVideo");
    btnFullScreen=document.getElementById("btnFullscreen");

    //playButton.addEventListener("click",function(){playVideo()})
    playButton.onclick=function(){playVideo(null)};
    btnStopVideo.onclick=stopVideo;
    btnFullScreen.onclick=fullscreen

    var inputUrl = document.getElementById("inputUrl");
    //inputUrl.value = defaultProtos["http"]["url"];
    inputUrl.value = defaultProtos.http.url;    
    //Player object.
    player = new Player();
    
    var loadingDiv = document.getElementById("loading");
    player.setLoadingDiv(loadingDiv);
    
    //Formated logger.
    var logger = new Logger("Page");
    
    checkQueryParams();
}


function checkQueryParams(){
    const urlParams = new URLSearchParams(window.location.search);
    const myVidParam = urlParams.get('vid');
    //const myPlayParam = urlParams.get('play');
    //console.log(`vid=${myVidParam} play=${myPlayParam}`)
    console.log(`vid=${myVidParam}`)
    
    if(myVidParam!==null){
        var cboProtocol = document.getElementById("protocol");
        cboProtocol.hidden=true;
        inputUrl.hidden=true;
        var inputDiv = document.getElementById("inputDiv");
        inputDiv.innerHTML=myVidParam;
        playVideo(myVidParam);
    }
}

function playVideo(vidURL) {
    console.log("playVideo " + vidURL);

    var currentState = player.getState();
    if (currentState == playerStatePlaying) {
        playButton.src = "img/play.png";
    } else {
        playButton.src = "img/pause.png";
    }

    if (currentState != playerStatePlaying) {
        var url=vidURL;
        var waitLength = 512 * 1024
        var stream= false

        if(url==null){
            var protoList = document.getElementById("protocol");
            var proto = protoList.options[protoList.selectedIndex].value;
            var protoObj = defaultProtos[proto];
            var inputUrl = document.getElementById("inputUrl");
            url = inputUrl.value;
            waitLength=proto.waitLength;
            stream=proto.stream;
        }
        console.log(`playing ${url}`)

        const canvasId = "playCanvas";
        var canvas = document.getElementById(canvasId);
        if (!canvas) {
            logger.logError("No Canvas with id " + canvasId + "!");
            return false;
        }

        var timeTrack = document.getElementById("timeTrack");
        var timeLabel = document.getElementById("timeLabel");
        player.setTrack(timeTrack, timeLabel);
        console.log("setTrack")

        player.play(url, canvas, function (e) {
            console.log("play error " + e.error + " status " + e.status + ".");
            if (e.error == 1) {
                logger.logInfo("Finished.");
            }
        }, waitLength, stream);

    } else {
        player.pause();
    }

    return true;
}

function stopVideo() {
    player.stop();
    var button = document.getElementById("btnPlayVideo");
    button.value = "Play";
    button.src = "img/play.png";
}

function fullscreen() {
    player.fullscreen();
}

function onSelectProto() {
    var protoList = document.getElementById("protocol");
    var proto = protoList.options[protoList.selectedIndex].value;
    var protoObj = defaultProtos[proto];
    var inputUrl = document.getElementById("inputUrl");
    inputUrl.value = protoObj["url"];
}
  