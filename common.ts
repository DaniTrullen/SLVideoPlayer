//Enumerats i funcions de console log

//Player request.
const kPlayVideoReq         = 0;
const kPauseVideoReq        = 1;
const kStopVideoReq         = 2;

//Player response.
const kPlayVideoRsp         = 0;
const kAudioInfo            = 1;
const kVideoInfo            = 2;
const kAudioData            = 3;
const kVideoData            = 4;

//Downloader request.
const kGetFileInfoReq       = 0;
const kDownloadFileReq      = 1;
const kCloseDownloaderReq   = 2;

//Downloader response.
const kGetFileInfoRsp       = 0;
const kFileData             = 1;

//Downloader Protocol.
const kProtoHttp            = 0;
const kProtoWebsocket       = 1;

//Decoder request.
const kInitDecoderReq       = 0;
const kUninitDecoderReq     = 1;
const kOpenDecoderReq       = 2;
const kCloseDecoderReq      = 3;
const kFeedDataReq          = 4;
const kStartDecodingReq     = 5;
const kPauseDecodingReq     = 6;
const kSeekToReq            = 7;

//Decoder response.
const kInitDecoderRsp       = 0;
const kUninitDecoderRsp     = 1;
const kOpenDecoderRsp       = 2;
const kCloseDecoderRsp      = 3;
const kVideoFrame           = 4;
const kAudioFrame           = 5;
const kStartDecodingRsp     = 6;
const kPauseDecodingRsp     = 7;
const kDecodeFinishedEvt    = 8;
const kRequestDataEvt       = 9;
const kSeekToRsp            = 10;

//classe per dades d'urls i protocols
class Proto{
    url:string="" 
    waitLength:number=0 
    stream:boolean=false
    constructor(url:string,waitLength:number, stream:boolean) {
        this.url=url;
        this.waitLength=waitLength;
        this.stream=stream;
    }
}

class CustomError{
    error: number=0
    status:  number=0
    message: string=""
    constructor(error:number, status:number,message:string){
        this.error=error;
        this.status=status;
        this.message=message;
    }
}

class Logger{
    private module: string=""
    constructor(module:string) {
        this.module = module;
    }

    public log(line: string) {
        console.log("[" + this.currentTimeStr() + "][" + this.module + "]" + line);
    }

    public logError(line: string) {
        console.log("[" + this.currentTimeStr() + "][" + this.module + "][ER] " + line);
    }

    public logInfo(line: string) {
        console.log("[" + this.currentTimeStr() + "][" + this.module + "][IF] " + line);
    }

    public logDebug(line: string) {
        console.log("[" + this.currentTimeStr() + "][" + this.module + "][DT] " + line);
    }

    public currentTimeStr() {
        var now = new Date(Date.now());
        var year = now.getFullYear();
        var month = now.getMonth() + 1;
        var day = now.getDate();
        var hour = now.getHours();
        var min = now.getMinutes();
        var sec = now.getSeconds();
        var ms = now.getMilliseconds();
        return year + "-" + month + "-" + day + " " + hour + ":" + min + ":" + sec + ":" + ms;
    }
}
