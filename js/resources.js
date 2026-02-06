function ResourcesHandler(callback){
	//numero immagini da caricare/caricate
	this.imgNumber = 0;
	this.imgLoaded = 0;
	this.imgAllLoaded = false;
	
	//numero suoni da caricare/caricati
	this.sndNumber = 0;
	this.sndLoaded = 0;
	this.sndAllLoaded = true; // Set to true by default since we're not loading sounds
	
	//funzione da eseguire al completamento di tutti i caricamenti
	this.OnLoad = callback;
	
	//carica un immagine e ritorna un id
	this.LoadImage = function(url, funct){
		var img = new Image();
		img.crossOrigin = "anonymous"; // Enable CORS to prevent canvas tainting
		img.src = url;
		img.rh = this;
		this.imgNumber++;
		img.onload = function(){ 
			if(funct != undefined){
				funct();
			}
			this.rh.imgLoaded++;
			
			//se il numero di immagini caricate è uguale al numero di immagini richieste
			if(this.rh.imgNumber == this.rh.imgLoaded){ 
				this.rh.imgAllLoaded = true;
				if(this.rh.sndAllLoaded){
					this.rh.OnLoad();
				}
			}
		};
		img.onerror = function() {
			console.error("Failed to load image: " + url);
			// Try fallback to default tileset
			if (url !== 'res/tileset.png') {
				img.src = 'res/tileset.png';
			} else {
				// If even fallback fails, still initialize
				if(funct != undefined){
					funct();
				}
				this.rh.imgLoaded++;
			}
		};
		return img;
	}
	 
	
	//carica un suono
	this.LoadSound = function(url){
		var sound = new Audio();
		sound.src = url;
		sound.volume = 0.05;
		this.sndNumber++;
		sound.rh = this;
		sound.addEventListener("canplaythrough", function(){
			this.rh.sndLoaded++;
			
			//se il numero di suoni caricati è uguale al numero di suoni richiesti
			if(this.rh.sndNumber == this.rh.sndLoaded){ 
				this.rh.sndAllLoaded = true;
				if(this.rh.imgAllLoaded){
					this.rh.OnLoad();
				}
			}
		}, true);
		return sound;
	} 

}