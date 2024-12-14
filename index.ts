let playButton: HTMLElement;
let btnStopVideo: HTMLElement;
let btnFullScreen: HTMLElement;
let cboProtocol: HTMLElement;
let inputUrl: HTMLInputElement;
let loadingDiv: HTMLElement;
let inputDiv: HTMLElement;
let protoList: HTMLSelectElement;
let canvas:HTMLElement;
let timeTrack:HTMLTrackElement;
let timeLabel:HTMLLabelElement;


let player: Player;
const canvasId = "playCanvas";

//Formated logger.
let logger:Logger;

//urls de test
const defaultProtos = new Map<string,Proto>();
defaultProtos.set("http1",new Proto("./video/h264_baseline_aac.mp4",  512 * 1024, false))
defaultProtos.set("http2",new Proto( "./video/h264_high_aac.mp4",512 * 1024, false))
defaultProtos.set("http3",new Proto("./video/h264_high_noaudio.mp4",512 * 1024,false))
defaultProtos.set("http4", new Proto("./video/h265_high.mp4",   512 * 1024, false))
defaultProtos.set("httpFlv", new Proto("https://data.vod.itc.cn/bee/qf/wasm?tok=e4da89d923e4e2af4d622a0edb717f88827b422a&format=flv&direct=1", 512 * 1024,true))

// inicialitzacó despres de que es carregui la pàgina HTML
window.addEventListener('load',function(){
    logger = new Logger("Page");

    //captura dels elements HTML
    playButton= document.getElementById("btnPlayVideo")!;
    btnStopVideo = document.getElementById("btnStopVideo")!;
    btnFullScreen = document.getElementById("btnFullscreen")!;
    cboProtocol = document.getElementById("protocol")!;
    inputUrl = <HTMLInputElement>document.getElementById("inputUrl")!;
    loadingDiv = document.getElementById("loading")!;
    inputDiv = document.getElementById("inputDiv")!;
    protoList = <HTMLSelectElement>document.getElementById("protocol")!;
    canvas = document.getElementById(canvasId)!;
    timeTrack = <HTMLTrackElement>document.getElementById("timeTrack")!;
    timeLabel = <HTMLLabelElement>document.getElementById("timeLabel")!;


    if (!canvas) {
        logger.logError("No Canvas with id " + canvasId + "!");
        return false;
    }

    //event click dels botons (imatges)
    playButton.onclick= function(){playVideo(null)};  //TODO:
    btnStopVideo.onclick=stopVideo;
    btnFullScreen.onclick=fullscreen
    cboProtocol.onchange=onSelectProto

    inputUrl.value = defaultProtos.get("http1")!.url // primer item del diccionari (map)

    //console.log("initializing...")
    //Player object.
    player = new Player();
    player.setLoadingDiv(loadingDiv);

    // verificar query params per fer autoplay    
    checkQueryParams();
});

/**
 * Verifica query params i fa autoplay en cas que ens passin una URL del vídeo
 */
function checkQueryParams(){
    const urlParams = new URLSearchParams(window.location.search);
    const myVidParam = urlParams.get('vid');
    //const myPlayParam = urlParams.get('play');
    //console.log(`vid=${myVidParam} play=${myPlayParam}`)
    console.log(`vid=${myVidParam}`)
    
    if(myVidParam!==null){
        cboProtocol.hidden=true;
        inputUrl.hidden=true;
        inputDiv.innerHTML=myVidParam;
        playVideo(myVidParam);
    }
}

/**
 * carrega el vídeo i el reprodueix
 * @param vidURL url del video a reproduir
 * @returns 
 */
function playVideo(vidURL:string|null) {
    console.log("playVideo " + vidURL);

    const currentState = player.getState();

    //assignar imatge al botó en funció de l'estat
    const playBtnImg=<HTMLImageElement>playButton;

    if (currentState != ePlayerStates.playerStatePlaying) {
        playBtnImg.src = "img/pause.png";

        let url: string=vidURL!;
        let waitLength: number = 512 * 1024
        let stream: boolean= false

        //si hem passat null a la funció, fem cas del valor del combo
        if(url==null){
            const selOpt:HTMLOptionElement = protoList.selectedOptions.item(0)!;
            if(selOpt){
                const selProto:string=selOpt.value
                const protoObj: Proto = defaultProtos.get(selProto)!;
                url = protoObj.url;
                waitLength=protoObj.waitLength;
                stream=protoObj.stream;
            }
        }
        //console.log(`playing ${url}`)

        player.setTrack(timeTrack, timeLabel);
        
        player.play(url, canvas, function (e) {
            console.log("play error " + e.error + " status " + e.status + ".");
            if (e.error == 1) {
                logger.logInfo("Finished.");
            }
        }, waitLength, stream);

    } else {
        playBtnImg.src = "img/play.png";
        player.pause();
    }

    return true;
}

function stopVideo() {
    player.stop();
    //playButton.value = "Play";
    let playBtn=<HTMLImageElement>playButton;
    playBtn.src = "img/play.png";
}

function fullscreen() {
    player.fullscreen();
}

function onSelectProto() {
    const proto = protoList.options[protoList.selectedIndex].value;
    const protoObj = defaultProtos[proto];
    inputUrl.value = protoObj["url"];
}
  