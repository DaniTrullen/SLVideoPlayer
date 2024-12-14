//Decoder states.
enum eDecoderStates{
    decoderStateIdle          = 0,
    decoderStateInitializing  = 1,
    decoderStateReady         = 2,
    decoderStateFinished      = 3
}

//Player states.
enum ePlayerStates{
    playerStateIdle = 0,
    playerStatePlaying = 1,
    playerStatePausing = 2
}

//Constant.
const maxBufferTimeLength       = 1.0;
const downloadSpeedByteRateCoef = 2.0;

// String.startsWith()
// String.prototype.startWith = function(str) {
//     var reg = new RegExp("^" + str);
//     return reg.test(this);
// };

class FileInfo {
    url: string;
    size: number = 0;
    offset: number = 0;
    chunkSize: number = 65536;

    constructor(url:string){
        this.url = url;
    }
}

class StreamPauseParams{
    url: string
    canvas:HTMLCanvasElement    
    callback: any
    waitHeaderLength: number
    constructor(url:string, canvas:HTMLCanvasElement, callback:any ,waitHeaderLength:number){
        this.url=url;
        this.canvas=canvas;
        this.callback=callback;
        this.waitHeaderLength=waitHeaderLength;
    }
}
type errCallbackType = (param1: CustomError)=>void

class Player {
    private fileInfo:FileInfo|null=null;
    private pcmPlayer:PCMPlayer|null= null;
    private canvas:HTMLCanvasElement|null= null;
    private webglPlayer:WebGLPlayer|null= null;
    private callback: errCallbackType|null =null;
    private waitHeaderLength:number= 524288;
    private duration           = 0;
    private pixFmt             = 0;
    private videoWidth         = 0;
    private videoHeight        = 0;
    private yLength            = 0;
    private uvLength           = 0;
    private beginTimeOffset    = 0;
    private decoderState: eDecoderStates= eDecoderStates.decoderStateIdle;
    private playerState: ePlayerStates = ePlayerStates.playerStateIdle;
    private decoding           = false;
    private decodeInterval     = 5;
    private videoRendererTimer = null;
    private downloadTimer      = null;
    private chunkInterval      = 200;
    private downloadSeqNo      = 0;
    private downloading        = false;
    private downloadProto      = kProtoHttp;
    private timeLabel:HTMLLabelElement=null!;
    private timeTrack:HTMLInputElement=null!;
    private trackTimer = null;
    private trackTimerInterval:number = 500;
    private displayDuration:string = "00:00:00";
    private audioEncoding      = "";
    private audioChannels      = 0;
    private audioSampleRate    = 0;
    private seeking:boolean= false;  // Flag to preventing multi seek from track.
    private justSeeked:boolean= false;  // Flag to preventing multi seek from ffmpeg.
    private urgent:boolean= false;
    private seekWaitLen        = 524288; // Default wait for 512K, will be updated in onVideoParam.
    private seekReceivedLen    = 0;
    private loadingDiv:HTMLDivElement|null= null;
    private buffering          = false;
    private frameBuffer        = [];
    private isStream           = false;
    private streamReceivedLen  = 0;
    private firstAudioFrame    = true;
    private fetchController    = null;
    private streamPauseParam:StreamPauseParams|null  = null;
    private downloadWorker: Worker | null = null;
    private decodeWorker: Worker | null = null;
    private logger:Logger = new Logger("Player");

    public constructor() {
        this.initDownloadWorker();
        this.initDecodeWorker();
    }


    private initDownloadWorker()  {
        var self = this;
        this.downloadWorker = new Worker("downloader-worker.js");
        this.downloadWorker.onmessage = function (evt) {
            var objData = evt.data;
            switch (objData.t) {
                case kGetFileInfoRsp:
                    self.onGetFileInfo(objData.i);
                    break;
                case kFileData:
                    self.onFileData(objData.d, objData.s, objData.e, objData.q);
                    break;
            }
        }
    };
    public initDecodeWorker()  {
        var self = this;
        this.decodeWorker = new Worker("decoder-worker.js");
        this.decodeWorker.onmessage = function (evt) {
            var objData = evt.data;
            switch (objData.t) {
                case kInitDecoderRsp:
                    self.onInitDecoder(objData);
                    break;
                case kOpenDecoderRsp:
                    self.onOpenDecoder(objData);
                    break;
                case kVideoFrame:
                    self.onVideoFrame(objData);
                    break;
                case kAudioFrame:
                    self.onAudioFrame(objData);
                    break;
                case kDecodeFinishedEvt:
                    self.onDecodeFinished(objData);
                    break;
                case kRequestDataEvt:
                    self.onRequestData(objData.o, objData.a);
                    break;
                case kSeekToRsp:
                    self.onSeekToRsp(objData.r);
                    break;
            }
        }
    };

    public play(url: string, canvas: HTMLCanvasElement, callback: errCallbackType, waitHeaderLength: number, isStream: boolean) {
        this.logger.logInfo("Play " + url + ".");

        var ret = {
            e: 0,
            m: "Success"
        };

        var success = true;
        do {
            if (this.playerState == ePlayerStates.playerStatePausing) {
                ret = this.resume(false);
                break;
            }

            if (this.playerState == ePlayerStates.playerStatePlaying) {
                break;
            }

            if (!url) {
                ret = {
                    e: -1,
                    m: "Invalid url"
                };
                success = false;
                this.logger.logError("[ER] playVideo error, url empty.");
                break;
            }

            if (!canvas) {
                ret = {
                    e: -2,
                    m: "Canvas not set"
                };
                success = false;
                this.logger.logError("[ER] playVideo error, canvas empty.");
                break;
            }

            if (!this.downloadWorker) {
                ret = {
                    e: -3,
                    m: "Downloader not initialized"
                };
                success = false;
                this.logger.logError("[ER] Downloader not initialized.");
                break
            }

            if (!this.decodeWorker) {
                ret = {
                    e: -4,
                    m: "Decoder not initialized"
                };
                success = false;
                this.logger.logError("[ER] Decoder not initialized.");
                break
            }

            if (url.startsWith("ws://") || url.startsWith("wss://")) {
                this.downloadProto = kProtoWebsocket;
            } else {
                this.downloadProto = kProtoHttp;
            }

            this.fileInfo = new FileInfo(url);
            this.canvas = canvas;
            this.callback = callback;
            this.waitHeaderLength = waitHeaderLength || this.waitHeaderLength;
            this.playerState = ePlayerStates.playerStatePlaying;
            this.isStream = isStream;
            this.startTrackTimer();
            this.displayLoop();

            //var playCanvasContext = playCanvas.getContext("2d"); //If get 2d, webgl will be disabled.
            this.webglPlayer = new WebGLPlayer(this.canvas, {
                preserveDrawingBuffer: false
            });

            if (!this.isStream) {
                var req = {
                    t: kGetFileInfoReq,
                    u: url,
                    p: this.downloadProto
                };
                this.downloadWorker.postMessage(req);
            } else {
                this.requestStream(url);
                this.onGetFileInfo({
                    sz: -1,
                    st: 200
                });
            }

            //això és per pausar el player quan es perd la visibilitat (canvi de pestanya, minimitzar el navegador, etc)
            // var self = this;
            // this.registerVisibilityEvent(function(visible) {
            //     if (visible) {
            //         self.resume(false);
            //     } else {
            //         self.pause();
            //     }
            // });

            this.buffering = true;
            this.showLoading();
        } while (false);

        return ret;
    };

    /**
     * Pausar en mode streaming (live)
     * @returns 
     */
    private pauseStream() {
        if (this.playerState != ePlayerStates.playerStatePlaying) {
            var ret = {
                e: -1,
                m: "Not playing"
            };
            return ret;
        }

        this.streamPauseParam = new StreamPauseParams(this.fileInfo.url, this.canvas, this.callback, this.waitHeaderLength)
        
        this.logger.logInfo("Stop in stream pause.");
        this.stop();

        var ret = {
            e: 0,
            m: "Success"
        };

        return ret;
    }

    public pause() {
        if (this.isStream) {
            return this.pauseStream();
        }

        this.logger.logInfo("Pause.");

        if (this.playerState != ePlayerStates.playerStatePlaying) {
            var ret = {
                e: -1,
                m: "Not playing"
            };
            return ret;
        }

        //Pause video rendering and audio flushing.
        this.playerState = ePlayerStates.playerStatePausing;

        //Pause audio context.
        if (this.pcmPlayer) {
            this.pcmPlayer.pause();
        }

        //Pause decoding.
        this.pauseDecoding();

        //Stop track timer.
        this.stopTrackTimer();

        //Do not stop downloader for background buffering.
        var ret = {
            e: 0,
            m: "Success"
        };

        return ret;
    };

    public resumeStream() {
        if (this.playerState != ePlayerStates.playerStateIdle || !this.streamPauseParam) {
            var ret = {
                e: -1,
                m: "Not pausing"
            };
            return ret;
        }

        this.logger.logInfo("Play in stream resume.");
        this.play(this.streamPauseParam.url,
                this.streamPauseParam.canvas,
                this.streamPauseParam.callback,
                this.streamPauseParam.waitHeaderLength,
                true);
        this.streamPauseParam = null;

        var ret = {
            e: 0,
            m: "Success"
        };

        return ret;
    }

    public resume(fromSeek:boolean) {
        if (this.isStream) {
            return this.resumeStream();
        }

        this.logger.logInfo("Resume.");

        if (this.playerState != ePlayerStates.playerStatePausing) {
            var ret = {
                e: -1,
                m: "Not pausing"
            };
            return ret;
        }

        if (!fromSeek) {
            //Resume audio context.
            this.pcmPlayer.resume();
        }

        //If there's a flying video renderer op, interrupt it.
        if (this.videoRendererTimer != null) {
            clearTimeout(this.videoRendererTimer);
            this.videoRendererTimer = null;
        }

        //Restart video rendering and audio flushing.
        this.playerState = ePlayerStates.playerStatePlaying;

        //Restart decoding.
        this.startDecoding();

        //Restart track timer.
        if (!this.seeking) {
            this.startTrackTimer();
        }

        var ret = {
            e: 0,
            m: "Success"
        };
        return ret;
    };

    public stop() {
        this.logger.logInfo("Stop.");
        if (this.playerState == ePlayerStates.playerStateIdle) {
            var ret = {
                e: -1,
                m: "Not playing"
            };
            return ret;
        }

        if (this.videoRendererTimer != null) {
            clearTimeout(this.videoRendererTimer);
            this.videoRendererTimer = null;
            this.logger.logInfo("Video renderer timer stopped.");
        }

        this.stopDownloadTimer();
        this.stopTrackTimer();
        this.hideLoading();

        this.fileInfo           = null;
        this.canvas             = null;
        this.webglPlayer        = null;
        this.callback           = null;
        this.duration           = 0;
        this.pixFmt             = 0;
        this.videoWidth         = 0;
        this.videoHeight        = 0;
        this.yLength            = 0;
        this.uvLength           = 0;
        this.beginTimeOffset    = 0;
        this.decoderState       = eDecoderStates.decoderStateIdle;
        this.playerState        = ePlayerStates.playerStateIdle;
        this.decoding           = false;
        this.frameBuffer        = [];
        this.buffering          = false;
        this.streamReceivedLen  = 0;
        this.firstAudioFrame    = true;
        this.urgent             = false;
        this.seekReceivedLen    = 0;

        if (this.pcmPlayer) {
            this.pcmPlayer.destroy();
            this.pcmPlayer = null;
            this.logger.logInfo("Pcm player released.");
        }

        if (this.timeTrack) {
            this.timeTrack.value = "0";
        }
        if (this.timeLabel) {
            this.timeLabel.innerHTML = this.formatTime(0) + "/" + this.displayDuration;
        }

        this.logger.logInfo("Closing decoder.");
        this.decodeWorker.postMessage({
            t: kCloseDecoderReq
        });


        this.logger.logInfo("Uniniting decoder.");
        this.decodeWorker.postMessage({
            t: kUninitDecoderReq
        });

        if (this.fetchController) {
            this.fetchController.abort();
            this.fetchController = null;
        }

        return ret;
    };

    public seekTo(ms: number) {
        if (this.isStream) {
            return;
        }

        // Pause playing.
        this.pause();

        // Stop download.
        this.stopDownloadTimer();

        // Clear frame buffer.
        this.frameBuffer.length = 0;

        // Request decoder to seek.
        this.decodeWorker.postMessage({
            t: kSeekToReq,
            ms: ms
        });

        // Reset begin time offset.
        this.beginTimeOffset = ms / 1000;
        this.logger.logInfo("seekTo beginTimeOffset " + this.beginTimeOffset);

        this.seeking = true;
        this.justSeeked = true;
        this.urgent = true;
        this.seekReceivedLen = 0;
        this.startBuffering();
        };

    public fullscreen() {
        if (this.webglPlayer) {
            this.webglPlayer.fullscreen();
        }
    };

    public getState() {
        return this.playerState;
    };

    public setTrack(timeTrack:HTMLInputElement, timeLabel:HTMLLabelElement) {
        this.timeTrack = timeTrack;
        this.timeLabel = timeLabel;

        if (this.timeTrack) {
            var self = this;
            this.timeTrack.oninput = function () {
                if (!self.seeking) {
                    self.seekTo(parseInt(self.timeTrack.value));
                }
            }
            this.timeTrack.onchange = function () {
                if (!self.seeking) {
                    self.seekTo(parseInt(self.timeTrack.value));
                }
            }
        }
    };

    public onGetFileInfo(info) {
        if (this.playerState == ePlayerStates.playerStateIdle) {
            return;
        }

        this.logger.logInfo("Got file size rsp:" + info.st + " size:" + info.sz + " byte.");
        if (info.st == 200) {
            this.fileInfo.size = Number(info.sz);
            this.logger.logInfo("Initializing decoder.");
            var req = {
                t: kInitDecoderReq,
                s: this.fileInfo.size,
                c: this.fileInfo.chunkSize
            };
            this.decodeWorker.postMessage(req);
        } else {
            this.reportPlayError(-1, info.st);
        }
    };

    public onFileData(data, start, end, seq) {
        //this.logger.logInfo("Got data bytes=" + start + "-" + end + ".");
        this.downloading = false;

        if (this.playerState == ePlayerStates.playerStateIdle) {
            return;
        }

        if (seq != this.downloadSeqNo) {
            return;  // Old data.
        }

        if (this.playerState == playerStatePausing) {
            if (this.seeking) {
                this.seekReceivedLen += data.byteLength;
                let left = this.fileInfo.size - this.fileInfo.offset;
                let seekWaitLen = Math.min(left, this.seekWaitLen);
                if (this.seekReceivedLen >= seekWaitLen) {
                    this.logger.logInfo("Resume in seek now");
                    setTimeout(() => {
                        this.resume(true);
                    }, 0);
                }
            } else {
                return;
            }
        }

        var len = end - start + 1;
        this.fileInfo.offset += len;

        var objData = {
            t: kFeedDataReq,
            d: data
        };
        this.decodeWorker.postMessage(objData, [objData.d]);

        switch (this.decoderState) {
            case decoderStateIdle:
                this.onFileDataUnderDecoderIdle();
                break;
            case decoderStateInitializing:
                this.onFileDataUnderDecoderInitializing();
                break;
            case decoderStateReady:
                this.onFileDataUnderDecoderReady();
                break;
        }

        if (this.urgent) {
            setTimeout(() => {
                this.downloadOneChunk();
            }, 0);
        }
    };

    public onFileDataUnderDecoderIdle() {
        if (this.fileInfo.offset >= this.waitHeaderLength || (!this.isStream && this.fileInfo.offset == this.fileInfo.size)) {
            this.logger.logInfo("Opening decoder.");
            this.decoderState = decoderStateInitializing;
            var req = {
                t: kOpenDecoderReq
            };
            this.decodeWorker.postMessage(req);
        }

        this.downloadOneChunk();
    };

    public onFileDataUnderDecoderInitializing() {
        this.downloadOneChunk();
    };

    public onFileDataUnderDecoderReady() {
        //this.downloadOneChunk();
    };

    public onInitDecoder(objData) {
        if (this.playerState == ePlayerStates.playerStateIdle) {
            return;
        }

        this.logger.logInfo("Init decoder response " + objData.e + ".");
        if (objData.e == 0) {
            if (!this.isStream) {
                this.downloadOneChunk();
            }
        } else {
            this.reportPlayError(objData.e);
        }
    };

    public onOpenDecoder(objData) {
        if (this.playerState == ePlayerStates.playerStateIdle) {
            return;
        }

        this.logger.logInfo("Open decoder response " + objData.e + ".");
        if (objData.e == 0) {
            this.onVideoParam(objData.v);
            this.onAudioParam(objData.a);
            this.decoderState = decoderStateReady;
            this.logger.logInfo("Decoder ready now.");
            this.startDecoding();
        } else {
            this.reportPlayError(objData.e);
        }
    };

    public onVideoParam(v) {
        if (this.playerState == ePlayerStates.playerStateIdle) {
            return;
        }

        this.logger.logInfo("Video param duation:" + v.d + " pixFmt:" + v.p + " width:" + v.w + " height:" + v.h + ".");
        this.duration = v.d;
        this.pixFmt = v.p;
        //this.canvas.width = v.w;
        //this.canvas.height = v.h;
        this.videoWidth = v.w;
        this.videoHeight = v.h;
        this.yLength = this.videoWidth * this.videoHeight;
        this.uvLength = (this.videoWidth / 2) * (this.videoHeight / 2);

        /*
        //var playCanvasContext = playCanvas.getContext("2d"); //If get 2d, webgl will be disabled.
        this.webglPlayer = new WebGLPlayer(this.canvas, {
            preserveDrawingBuffer: false
        });
        */

        if (this.timeTrack) {
            this.timeTrack.min = 0;
            this.timeTrack.max = this.duration;
            this.timeTrack.value = 0;
            this.displayDuration = this.formatTime(this.duration / 1000);
        }

        var byteRate = 1000 * this.fileInfo.size / this.duration;
        var targetSpeed = downloadSpeedByteRateCoef * byteRate;
        var chunkPerSecond = targetSpeed / this.fileInfo.chunkSize;
        this.chunkInterval = 1000 / chunkPerSecond;
        this.seekWaitLen = byteRate * maxBufferTimeLength * 2;
        this.logger.logInfo("Seek wait len " + this.seekWaitLen);

        if (!this.isStream) {
            this.startDownloadTimer();
        }

        this.logger.logInfo("Byte rate:" + byteRate + " target speed:" + targetSpeed + " chunk interval:" + this.chunkInterval + ".");
    };

    public onAudioParam(a) {
        if (this.playerState == ePlayerStates.playerStateIdle) {
            return;
        }

        this.logger.logInfo("Audio param sampleFmt:" + a.f + " channels:" + a.c + " sampleRate:" + a.r + ".");

        var sampleFmt = a.f;
        var channels = a.c;
        var sampleRate = a.r;

        var encoding = "16bitInt";
        switch (sampleFmt) {
            case 0:
                encoding = "8bitInt";
                break;
            case 1:
                encoding = "16bitInt";
                break;
            case 2:
                encoding = "32bitInt";
                break;
            case 3:
                encoding = "32bitFloat";
                break;
            default:
                this.logger.logError("Unsupported audio sampleFmt " + sampleFmt + "!");
        }
        this.logger.logInfo("Audio encoding " + encoding + ".");

        this.pcmPlayer = new PCMPlayer({
            encoding: encoding,
            channels: channels,
            sampleRate: sampleRate,
            flushingTime: 5000
        });

        this.audioEncoding      = encoding;
        this.audioChannels      = channels;
        this.audioSampleRate    = sampleRate;
    };

    public restartAudio() {
        if (this.pcmPlayer) {
            this.pcmPlayer.destroy();
            this.pcmPlayer = null;
        }

        this.pcmPlayer = new PCMPlayer({
            encoding: this.audioEncoding,
            channels: this.audioChannels,
            sampleRate: this.audioSampleRate,
            flushingTime: 5000
        });
    };

    public bufferFrame(frame) {
        // If not decoding, it may be frame before seeking, should be discarded.
        if (!this.decoding) {
            return;
        }
        this.frameBuffer.push(frame);
        //this.logger.logInfo("bufferFrame " + frame.s + ", seq " + frame.q);
        if (this.getBufferTimerLength() >= maxBufferTimeLength || this.decoderState == decoderStateFinished) {
            if (this.decoding) {
                //this.logger.logInfo("Frame buffer time length >= " + maxBufferTimeLength + ", pause decoding.");
                this.pauseDecoding();
            }
            if (this.buffering) {
                this.stopBuffering();
            }
        }
    }

    public displayAudioFrame(frame) {
        if (this.playerState != ePlayerStates.playerStatePlaying) {
            return false;
        }

        if (this.seeking) {
            this.restartAudio();
            this.startTrackTimer();
            this.hideLoading();
            this.seeking = false;
            this.urgent = false;
        }

        if (this.isStream && this.firstAudioFrame) {
            this.firstAudioFrame = false;
            this.beginTimeOffset = frame.s;
        }

        this.pcmPlayer.play(new Uint8Array(frame.d));
        return true;
    };

    public onAudioFrame(frame) {
        this.bufferFrame(frame);
    };

    public onDecodeFinished(objData) {
        this.pauseDecoding();
        this.decoderState   = decoderStateFinished;
    };

    public getBufferTimerLength = function() {
        if (!this.frameBuffer || this.frameBuffer.length == 0) {
            return 0;
        }

        let oldest = this.frameBuffer[0];
        let newest = this.frameBuffer[this.frameBuffer.length - 1];
        return newest.s - oldest.s;
    };

    public onVideoFrame(frame) {
        this.bufferFrame(frame);
    };

    public displayVideoFrame(frame) {
        if (this.playerState != ePlayerStates.playerStatePlaying) {
            return false;
        }

        if (this.seeking) {
            this.restartAudio();
            this.startTrackTimer();
            this.hideLoading();
            this.seeking = false;
            this.urgent = false;
        }

        var audioCurTs = this.pcmPlayer.getTimestamp();
        var audioTimestamp = audioCurTs + this.beginTimeOffset;
        var delay = frame.s - audioTimestamp;

        //this.logger.logInfo("displayVideoFrame delay=" + delay + "=" + " " + frame.s  + " - (" + audioCurTs  + " + " + this.beginTimeOffset + ")" + "->" + audioTimestamp);

        if (audioTimestamp <= 0 || delay <= 0) {
            var data = new Uint8Array(frame.d);
            this.renderVideoFrame(data);
            return true;
        }
        return false;
    };

    public onSeekToRsp(ret) {
        if (ret != 0) {
            this.justSeeked = false;
            this.seeking = false;
        }
    };

    public onRequestData(offset, available) {
        if (this.justSeeked) {
            this.logger.logInfo("Request data " + offset + ", available " + available);
            if (offset == -1) {
                // Hit in buffer.
                let left = this.fileInfo.size - this.fileInfo.offset;
                if (available >= left) {
                    this.logger.logInfo("No need to wait");
                    this.resume(false);
                } else {
                    this.startDownloadTimer();
                }
            } else {
                if (offset >= 0 && offset < this.fileInfo.size) {
                    this.fileInfo.offset = offset;
                }
                this.startDownloadTimer();
            }

            //this.restartAudio();
            this.justSeeked = false;
        }
    };

    public displayLoop() {
        if (this.playerState !== ePlayerStates.playerStateIdle) {
            requestAnimationFrame(this.displayLoop.bind(this));
        }
        if (this.playerState != ePlayerStates.playerStatePlaying) {
            return;
        }

        if (this.frameBuffer.length == 0) {
            return;
        }

        if (this.buffering) {
            return;
        }

        // requestAnimationFrame may be 60fps, if stream fps too large,
        // we need to render more frames in one loop, otherwise display
        // fps won't catch up with source fps, leads to memory increasing,
        // set to 2 now.
        let i:number=0;
        for (i = 0; i < 2; ++i) {
            var frame = this.frameBuffer[0];
            switch (frame.t) {
                case kAudioFrame:
                    if (this.displayAudioFrame(frame)) {
                        this.frameBuffer.shift();
                    }
                    break;
                case kVideoFrame:
                    if (this.displayVideoFrame(frame)) {
                        this.frameBuffer.shift();
                    }
                    break;
                default:
                    return;
            }

            if (this.frameBuffer.length == 0) {
                break;
            }
        }

        if (this.getBufferTimerLength() < maxBufferTimeLength / 2) {
            if (!this.decoding) {
                //this.logger.logInfo("Buffer time length < " + maxBufferTimeLength / 2 + ", restart decoding.");
                this.startDecoding();
            }
        }

        if (this.bufferFrame.length == 0) {
            if (this.decoderState == eDecoderStates.decoderStateFinished) {
                this.reportPlayError(1, 0, "Finished");
                this.stop();
            } else {
                this.startBuffering();
            }
        }
    };

    public startBuffering() {
        this.buffering = true;
        this.showLoading();
        this.pause();
    }

    public stopBuffering() {
        this.buffering = false;
        this.hideLoading();
        this.resume(false);
    }

    public renderVideoFrame(data:Uint8Array) {
        this.webglPlayer.renderFrame(data, this.videoWidth, this.videoHeight, this.yLength, this.uvLength);
    };

    public downloadOneChunk() {
        if (this.downloading || this.isStream) {
            return;
        }

        var start = this.fileInfo.offset;
        if (start >= this.fileInfo.size) {
            this.logger.logError("Reach file end.");
            this.stopDownloadTimer();
            return;
        }

        var end = this.fileInfo.offset + this.fileInfo.chunkSize - 1;
        if (end >= this.fileInfo.size) {
            end = this.fileInfo.size - 1;
        }

        var len = end - start + 1;
        if (len > this.fileInfo.chunkSize) {
            console.log("Error: request len:" + len + " > chunkSize:" + this.fileInfo.chunkSize);
            return;
        }

        var req = {
            t: kDownloadFileReq,
            u: this.fileInfo.url,
            s: start,
            e: end,
            q: this.downloadSeqNo,
            p: this.downloadProto
        };
        this.downloadWorker.postMessage(req);
        this.downloading = true;
    };

    public startDownloadTimer() {
        var self = this;
        this.downloadSeqNo++;
        this.downloadTimer = setInterval(function () {
            self.downloadOneChunk();
        }, this.chunkInterval);
    };

    public stopDownloadTimer() {
        if (this.downloadTimer != null) {
            clearInterval(this.downloadTimer);
            this.downloadTimer = null;
        }
        this.downloading = false;
    };

    public startTrackTimer() {
        var self = this;
        this.trackTimer = setInterval(function () {
            self.updateTrackTime();
        }, this.trackTimerInterval);
    };

    public stopTrackTimer() {
        if (this.trackTimer != null) {
            clearInterval(this.trackTimer);
            this.trackTimer = null;
        }
    };

    public updateTrackTime() {
        if (this.playerState == ePlayerStates.playerStatePlaying && this.pcmPlayer) {
            var currentPlayTime = this.pcmPlayer.getTimestamp() + this.beginTimeOffset;
            if (this.timeTrack) {
                this.timeTrack.value = 1000 * currentPlayTime;
            }

            if (this.timeLabel) {
                this.timeLabel.innerHTML = this.formatTime(currentPlayTime) + "/" + this.displayDuration;
            }
        }
    };

    public startDecoding() {
        var req = {
            t: kStartDecodingReq,
            i: this.urgent ? 0 : this.decodeInterval,
        };
        this.decodeWorker.postMessage(req);
        this.decoding = true;
    };

    public pauseDecoding() {
        var req = {
            t: kPauseDecodingReq
        };
        this.decodeWorker.postMessage(req);
        this.decoding = false;
    };

    public formatTime(seconds:number):string {
        var h = Math.floor(seconds / 3600) < 10 ? '0' + Math.floor(seconds / 3600) : Math.floor(seconds / 3600);
        var m = Math.floor((seconds / 60 % 60)) < 10 ? '0' + Math.floor((seconds / 60 % 60)) : Math.floor((seconds / 60 % 60));
        var s = Math.floor((seconds % 60)) < 10 ? '0' + Math.floor((seconds % 60)) : Math.floor((seconds % 60));
        return h + ":" + m + ":" + s;
    };

    public reportPlayError(error:number, status:number, message:string) {
        const e:CustomError = new CustomError( error || 0, status || 0, message)
        if (this.callback) {
            this.callback(e);
        }
    };

    public setLoadingDiv(loadingDiv:HTMLDivElement) {
        this.loadingDiv = loadingDiv;
    }

    public hideLoading() {
        if (this.loadingDiv != null) {
            loadingDiv.style.display = "none";
        }
    };

    public showLoading() {
        if (this.loadingDiv != null) {
            loadingDiv.style.display = "block";
        }
    };

    public registerVisibilityEvent(cb) {
        var hidden = "hidden";

        // Standards:
        if (hidden in document) {
            document.addEventListener("visibilitychange", onchange);
        } else if ((hidden = "mozHidden") in document) {
            document.addEventListener("mozvisibilitychange", onchange);
        } else if ((hidden = "webkitHidden") in document) {
            document.addEventListener("webkitvisibilitychange", onchange);
        } else if ((hidden = "msHidden") in document) {
            document.addEventListener("msvisibilitychange", onchange);
        } else if ("onfocusin" in document) {
            // IE 9 and lower.
            document.onfocusin = document.onfocusout = onchange;
        } else {
            // All others.
            window.onpageshow = window.onpagehide = window.onfocus = window.onblur = onchange;
        }
    

        function onchange(evt:Event) {
            var v = true;
            var h = false;
            var evtMap = {
                focus:v,
                focusin:v,
                pageshow:v,
                blur:h,
                focusout:h,
                pagehide:h
            };

            evt = evt || window.event;
            var visible = v;
            if (evt.type in evtMap) {
                visible = evtMap[evt.type];
            } else {
                visible = this[hidden] ? h : v;
            }
            cb(visible);
        }

        // set the initial state (but only if browser supports the Page Visibility API)
        if( document[hidden] !== undefined ) {
            onchange({type: document[hidden] ? "blur" : "focus"});
        }
    }

    public onStreamDataUnderDecoderIdle(length) {
        if (this.streamReceivedLen >= this.waitHeaderLength) {
            this.logger.logInfo("Opening decoder.");
            this.decoderState = decoderStateInitializing;
            var req = {
                t: kOpenDecoderReq
            };
            this.decodeWorker.postMessage(req);
        } else {
            this.streamReceivedLen += length;
        }
    };

    public requestStream(url) {
        var self = this;
        this.fetchController = new AbortController();
        const signal = this.fetchController.signal;

        fetch(url, {signal}).then(async function respond(response) {
            const reader = response.body.getReader();
            reader.read().then(function processData({done, value}) {
                if (done) {
                    self.logger.logInfo("Stream done.");
                    return;
                }

                if (self.playerState != ePlayerStates.playerStatePlaying) {
                    return;
                }

                var dataLength = value.byteLength;
                var offset = 0;
                if (dataLength > self.fileInfo.chunkSize) {
                    do {
                        let len = Math.min(self.fileInfo.chunkSize, dataLength);
                        var data = value.buffer.slice(offset, offset + len);
                        dataLength -= len;
                        offset += len;
                        var objData = {
                            t: kFeedDataReq,
                            d: data
                        };
                        self.decodeWorker.postMessage(objData, [objData.d]);
                    } while (dataLength > 0)
                } else {
                    var objData = {
                        t: kFeedDataReq,
                        d: value.buffer
                    };
                    self.decodeWorker.postMessage(objData, [objData.d]);
                }

                if (self.decoderState == decoderStateIdle) {
                    self.onStreamDataUnderDecoderIdle(dataLength);
                }

                return reader.read().then(processData);
            });
        }).catch(err => {
        });
    };
}