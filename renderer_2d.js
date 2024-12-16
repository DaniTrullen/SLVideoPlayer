class Canvas2DRenderer {
    _canvas = null;
    _ctx = null;
    _imageData=null;
    _YUVConverter=null
  
    constructor(canvas) {
      this._canvas = canvas;
      this._ctx = canvas.getContext("2d",{
        alpha: false,
        colorSpace: "srgb"
      });
      this._YUVConverter=new YUVConverter();

    }
  
    initImageData(width, height) {
			this._imageData = this._ctx.createImageData(width, height);

			// Prefill the alpha to opaque
			var data = this._imageData.data;
			var pixelCount = width * height * 4;
			for (var i = 0; i < pixelCount; i += 4) {
				data[i + 3] = 255;
			}
		}

    /**
     * 
     * @param {Uint8Array} yuvdata 
     * @param {number} width 
     * @param {number} height 
     * @param {number} uOffset 
     * @param {number} vOffset 
     */
    renderFrame(yuvdata, width, height, yLength, uvLength) {
      //ajustem la mida del canvas a la mida de la imatge
      if(this._canvas.width !== width) this._canvas.width = width;
      if(this._canvas.height !== height) this._canvas.height = height;

      this.initImageData(width,height);  //només fer-ho un cop!!
      //this._YUVConverter.convertYCbCr(yuvdata,width,height,yLength,uvLength, this._imageData)
      this._YUVConverter.YUV2RBG(yuvdata, width, height, this._imageData.data)


      console.log(`display frame width=${width}, height=${height}`)




      this._ctx.putImageData(this._imageData, 0, 0);
    }
  };
  