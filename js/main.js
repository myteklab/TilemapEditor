var editor = null;
var selection = null; 

/*
window.onerror = function(msg, url, linenumber) {
	return true;
}
*/
function StartEditor(){ 
	// Get dimensions from inputs if they exist, otherwise use defaults
	var width = $("mapWidth") ? parseInt($("mapWidth").value) || 50 : 50;
	var height = $("mapHeight") ? parseInt($("mapHeight").value) || 30 : 30;
	editor = new Editor(width, height); 
//editor.LoadMap();
}

function Editor(areaW, areaH){  
	//working area
	this.areaW = areaW;
	this.areaH = areaH;
	
	//this.cellSize = getQueryVariable("s");
	this.cellSize = 16;
	this.spacing = 0; // Always 0 - we don't use spacing
	
	// Zoom properties
	this.zoom = 1;
	this.minZoom = 0.25;
	this.maxZoom = 4;
	this.zoomStep = 0.1;
	
	this.SetSize = function(){
		this.div = $("EditorDiv");
		// Let CSS handle the sizing
		this.div.style.cursor = "copy";  
	}
	this.SetSize();
	
	 
	this.canvas = $("EditorCanvas");
	
	this.ResizeCanvas = function(){
		var newWidth = this.areaW * this.cellSize;
		var newHeight = this.areaH * this.cellSize;
		
		// Set the actual canvas resolution
		this.canvas.width = newWidth;
		this.canvas.height = newHeight;
		
		// Remove any width/height styles to prevent stretching
		this.canvas.style.width = '';
		this.canvas.style.height = '';
		
		// Apply zoom when resizing
		this.applyZoom();
	}
	
	this.applyZoom = function(){
		// Use CSS transform to scale the canvas without stretching
		// This maintains the aspect ratio and keeps cells square
		this.canvas.style.transform = 'scale(' + this.zoom + ')';
		this.canvas.style.transformOrigin = 'top left';
		
		// Calculate the actual space needed for the scaled canvas
		var baseWidth = this.areaW * this.cellSize;
		var baseHeight = this.areaH * this.cellSize;
		var scaledWidth = baseWidth * this.zoom + 100; // +100 for padding/margin
		var scaledHeight = baseHeight * this.zoom + 100;
		
		// Create or update a spacer div to force scrollbars
		var spacer = document.getElementById('editorSpacer');
		if (!spacer) {
			spacer = document.createElement('div');
			spacer.id = 'editorSpacer';
			spacer.style.position = 'absolute';
			spacer.style.pointerEvents = 'none';
			spacer.style.opacity = '0';
			this.div.appendChild(spacer);
		}
		
		// Set the spacer size to force scrollbars when needed
		spacer.style.width = scaledWidth + 'px';
		spacer.style.height = scaledHeight + 'px';
	}
	
	this.ResizeCanvas();
	
	var self = this; // Capture this for use in event handlers
	
	this.canvas.addEventListener('contextmenu', function (event) {
		event.preventDefault();
	});
	
	// Prevent middle click default behavior (auto-scroll) on both canvas and div
	this.canvas.addEventListener('mousedown', function(e) {
		if (e.button === 1) { // Middle button
			e.preventDefault();
			return false;
		}
	});
	
	this.div.addEventListener('mousedown', function(e) {
		if (e.button === 1) { // Middle button
			e.preventDefault();
			return false;
		}
	});
	
	this.canvas.addEventListener("mousedown", function(e){
		if(e.which == 1){
			self.mouseLeft = true;
			// Check tool type
			if (self.toolType === 'fill') {
				if(selection && selection.selected != null) {
					self.floodFill(self.mouseX, self.mouseY);
				}
			} else if (self.toolType === 'fillErase') {
				self.floodFillErase(self.mouseX, self.mouseY);
			} else if (self.toolType === 'rowFill') {
				if(selection && selection.selected != null) {
					self.fillRow(self.mouseX, self.mouseY);
				}
			} else if (self.toolType === 'columnFill') {
				if(selection && selection.selected != null) {
					self.fillColumn(self.mouseX, self.mouseY);
				}
			} else if (self.toolType === 'eraser') {
				self.removeBlock();
			} else {
				// Pencil tool
				if(selection && selection.selected != null) {
					self.placeBlock();
				}
			}
		}
		else if(e.which == 2){  // Middle mouse button
			e.preventDefault(); // Prevent default middle click behavior
			self.mouseMiddle = true;
			self.isPanning = true;
			self.panStartX = e.clientX;
			self.panStartY = e.clientY;
			self.panStartScrollX = self.div.scrollLeft;
			self.panStartScrollY = self.div.scrollTop;
			self.canvas.style.cursor = 'grabbing';
		}
		else if(e.which == 3){  
			self.mouseRight = true;
			self.removeBlock();
		}
		
	});
	
	// Add wheel event for zooming
	this.div.addEventListener('wheel', function(e) {
		e.preventDefault();

		// Get mouse position relative to canvas before zoom
		var rect = self.canvas.getBoundingClientRect();
		var mouseX = e.clientX - rect.left;
		var mouseY = e.clientY - rect.top;

		// Calculate zoom change based on actual scroll amount
		// Normalize deltaY: deltaMode 0 = pixels, 1 = lines, 2 = pages
		var deltaY = e.deltaY;
		if (e.deltaMode === 1) deltaY *= 20; // lines to pixels
		if (e.deltaMode === 2) deltaY *= 400; // pages to pixels

		// Use proportional zoom with sensitivity factor
		// Trackpads send small deltas, mouse wheels send larger ones
		var zoomSensitivity = 0.002;
		var delta = -deltaY * zoomSensitivity;

		// Clamp the delta to prevent huge jumps
		delta = Math.max(-0.2, Math.min(0.2, delta));

		var newZoom = Math.max(self.minZoom, Math.min(self.maxZoom, self.zoom + delta));
		
		if (newZoom !== self.zoom) {
			// Calculate the point we're zooming toward (in canvas coordinates)
			var canvasX = (mouseX + self.div.scrollLeft) / self.zoom;
			var canvasY = (mouseY + self.div.scrollTop) / self.zoom;
			
			// Apply new zoom
			self.zoom = newZoom;
			self.applyZoom();
			
			// Calculate new scroll position to keep the same point under the mouse
			var newScrollLeft = canvasX * self.zoom - mouseX;
			var newScrollTop = canvasY * self.zoom - mouseY;
			
			// Apply new scroll position
			self.div.scrollLeft = newScrollLeft;
			self.div.scrollTop = newScrollTop;
			
			// Update zoom indicator if it exists
			if ($("zoomIndicator")) {
				$("zoomIndicator").textContent = Math.round(self.zoom * 100) + "%";
			}
			
			// Redraw to update grid visibility
			self.Draw();
		}
	});
	
	this.ctx = this.canvas.getContext("2d");
	
	// views
	this.viewX = 0;
	this.viewY = 0;
	//mouse
	this.mouseX = 0;
	this.mouseY = 0;
	this.mouseLeft = false;
	this.mouseRight = false;
	
	this.drawGrid = true;
	this.drawTiles = true;
	this.drawBlocks = true;
	this.drawObjects = true;
	this.drawLayer = false;
	this.showLayerTransparency = true; // Default to showing other layers with transparency
	
	this.mode = 0;
	this.layer = 0;
	this.toolType = 'pencil'; // Default tool is pencil
	
	// Undo/Redo history stacks
	this.undoStack = [];
	this.redoStack = [];
	this.maxHistorySize = 50; // Limit history to prevent memory issues
	this.hasUnsavedChanges = false; // Track if we need to save state on mouse up
	
	$("mode").onchange = function(){
		editor.mode = this.selectedIndex;
		
		if(this.selectedIndex == 0){
			$("layer_p").style.display = "inline";
		}else{
			$("layer_p").style.display = "none";
		}
		
		if(this.selectedIndex == 2){
			$("newObject").style.display = "inline";
		}else{
			$("newObject").style.display = "none";
		}
	};
	
	// Add tool type radio button handlers
	var toolRadios = document.getElementsByName('toolType');
	for (var i = 0; i < toolRadios.length; i++) {
		toolRadios[i].onchange = function() {
			editor.toolType = this.value;
		};
	}
	
	// layer_s removed from UI - no longer needed
	if ($("layer_s")) {
		$("layer_s").onchange = function(){
			editor.layer = this.selectedIndex;
			editor.Draw();
			// Update layer indicator
			if ($("currentLayerIndicator")) {
				$("currentLayerIndicator").textContent = editor.layer;
			}
		};
	}
	if ($("export")) {
		$("export").onclick = function(){editor.Export();};
	}
	if ($("loadMap")) {
		$("loadMap").onclick = function(){editor.LoadMap();};
	}
	if ($("exportScreenshot")) {
		$("exportScreenshot").onclick = function(){editor.exportScreenshot();};
	}
	
	// Undo/Redo button handlers
	if ($("undoBtn")) {
		$("undoBtn").onclick = function(){
			editor.undo();
		};
	}
	if ($("redoBtn")) {
		$("redoBtn").onclick = function(){
			editor.redo();
		};
	}
	
	// Initialize button states after editor is ready (if the function exists)
	var self = this;
	setTimeout(function() {
		if (typeof self.updateUndoRedoButtons === 'function') {
			self.updateUndoRedoButtons();
		}
	}, 0);
	
	// Zoom button handlers (only if elements exist)
	if ($("zoomIn")) {
		$("zoomIn").onclick = function(){
			editor.zoom = Math.min(editor.maxZoom, editor.zoom + editor.zoomStep);
			editor.applyZoom();
			editor.Draw(); // Redraw to update grid visibility
			if ($("zoomIndicator")) {
				$("zoomIndicator").textContent = Math.round(editor.zoom * 100) + "%";
			}
		};
	}
	
	if ($("zoomOut")) {
		$("zoomOut").onclick = function(){
			editor.zoom = Math.max(editor.minZoom, editor.zoom - editor.zoomStep);
			editor.applyZoom();
			editor.Draw(); // Redraw to update grid visibility
			if ($("zoomIndicator")) {
				$("zoomIndicator").textContent = Math.round(editor.zoom * 100) + "%";
			}
		};
	}
	
	if ($("zoomReset")) {
		$("zoomReset").onclick = function(){
			editor.zoom = 1;
			editor.applyZoom();
			editor.Draw(); // Redraw to update grid visibility
			if ($("zoomIndicator")) {
				$("zoomIndicator").textContent = "100%";
			}
			// Center the canvas
			editor.div.scrollLeft = (editor.canvas.offsetWidth - editor.div.offsetWidth) / 2;
			editor.div.scrollTop = (editor.canvas.offsetHeight - editor.div.offsetHeight) / 2;
		};
	}
	
	if ($("newMap")) {
		$("newMap").onclick = function(){
			var w = prompt("Area Width",null);
			if (w != null){
				var h = prompt("Area Height",null);
				if (h != null){
					w = parseInt(w);
					h = parseInt(h);
					if(w*editor.cellSize < 4000 && h*editor.cellSize < 4000){
						editor = null;
						editor = new Editor(w,h); 
					}
					else{
						alert(w + " x "+ h +" is too big");
					}
				}
			}
		};
	}
	
	// Resize button removed - no longer needed
	
	
	// Remove the old onchange since we're using a button now
	// $("cellSize").onchange = function(){
	// 	editor.cellSize = parseInt(this.value);
	// 	editor.Draw();
	// 	if (selection) selection.Draw();
	// };
	$("grid_t").onchange = function(){
		editor.drawGrid = this.checked;
		editor.Draw();
	}; 
	$("tiles_t").onchange = function(){
		editor.drawTiles = this.checked;
		editor.Draw();
	}; 
	$("blocks_t").onchange = function(){
		editor.drawBlocks = this.checked;
		editor.Draw();
	}; 
	$("objects_t").onchange = function(){
		editor.drawObjects = this.checked;
		editor.Draw();
	};
	$("layer_t").onchange = function(){
		editor.drawLayer = this.checked;
		editor.Draw();
	}; 
	
	// Layer transparency toggle
	if ($("layerTransparency_t")) {
		$("layerTransparency_t").onchange = function(){
			editor.showLayerTransparency = this.checked;
			editor.Draw();
		};
	}
	
	// Remove old spacing onchange too
	// $("spacing").onchange = function(){
	// 	editor.spacing = parseInt(this.value);
	// 	editor.Draw();
	// 	if (selection) selection.Draw();
	// };
	
	// Add apply button handler for tile size (if it exists)
	if ($("applyTileSize")) {
		$("applyTileSize").onclick = function(){
			var cellSizeInput = $("cellSize");
			if (!cellSizeInput) {
				console.warn("cellSize input not found");
				return;
			}
			var newCellSize = parseInt(cellSizeInput.value);
		
		// Validate input
		if (newCellSize < 8 || newCellSize > 128) {
			alert("Tile size must be between 8 and 128 pixels");
			return;
		}
		
		// Update editor
		editor.cellSize = newCellSize;
		editor.spacing = 0; // Always 0 now
		editor.ResizeCanvas();
		editor.Draw();
		
		// Update selection if it exists
		if (selection) {
			selection.cellSize = newCellSize;
			selection.spacing = 0; // Always 0 now
			selection.updateCells(); // Recalculate the grid
			selection.selected = null; // Clear selection since grid changed
			selection.Draw();
		}
		
		// Show confirmation
		this.textContent = "✓";
		this.style.background = "#48bb78";
		var self = this;
		setTimeout(function() {
			self.textContent = "Apply";
			self.style.background = "#4299e1"; // Reset to original blue color
		}, 800);
		
		// Auto-save the project after applying tile size
		if (typeof currentProjectId !== 'undefined' && currentProjectId) {
			// Trigger save after a short delay so user sees the Apply confirmation first
			setTimeout(function() {
				editor.Export(); // This will save the project with new tile size
			}, 300);
		}
	};
	}
	
	// Resize Map functionality is now handled in index.php after editor is fully loaded
	
	if ($("newObject")) {
		$("newObject").onclick = function(){
			editor.objectId = null;
		}
	}
	
	if ($("newLayer")) {
		$("newLayer").onclick = function(){
			editor.tiles.push([]);
			// layer_s removed - just update layer index
			var newLayerIndex = editor.tiles.length - 1;
			editor.layer = newLayerIndex;
			editor.Draw();
		}
	}
	
	
	this.Export = function(){
		//var n = parseInt(prompt("Level Number",1));
		//var output = "levels["+n+"] = [";
		var output = "levels[1] = [";
		
		//settings
		
		output += "[" +
		this.cellSize + "," +
		0 + "," + // Always save 0 for spacing
		this.areaW + "," +
		this.areaH ;
		
		output += "],";
		
		//tiles
		output += "[";
		for(var i = 0; i < this.tiles.length; i ++){
			var layer = this.tiles[i];
			output += "[";
			for(var j = 0; j < layer.length; j ++){
				output += "[" +
				layer[j][4]+ "," +
				layer[j][0]/this.cellSize + "," +
				layer[j][1]/this.cellSize + "]";
				if(j < layer.length -1)
					output += ","
			}
			output += "]";
			if(i < this.tiles.length -1)
				output += ","
		}
		output += "],";
		
		//collision
		output += "[";
		for(var i = 0; i < this.blocks.length; i ++){
			output += "[" +
			this.blocks[i][0]/this.cellSize + "," +
			this.blocks[i][1]/this.cellSize + "]";
			if(i < this.blocks.length -1)
				output += ","
		}
		output += "],";
		
		//objects
		output += "[";
		for(var i = 0; i < this.objects.length; i ++){
			output += "[" +
			this.objects[i][0]/this.cellSize + "," +
			this.objects[i][1]/this.cellSize + "," +
			'"'+this.objects[i][2] + '"'+ "]";
			if(i < this.objects.length -1)
				output += ","
		}
		output += "]";
		
		
		output += "];";
		$("output").value = output;
	}

	this.exportScreenshot = function() {
		// Save the current grid and layer transparency states
		var originalGridState = this.drawGrid;
		var originalLayerTransparencyState = this.showLayerTransparency;

		// Temporarily disable the grid and layer transparency, then redraw
		this.drawGrid = false;
		this.showLayerTransparency = false;
		this.Draw();

		// Create a temporary canvas to capture the entire tilemap
		var tempCanvas = document.createElement('canvas');
		tempCanvas.width = this.areaW * this.cellSize;
		tempCanvas.height = this.areaH * this.cellSize;
		var tempCtx = tempCanvas.getContext('2d');

		// Copy the current canvas content (now without grid and with full opacity layers)
		tempCtx.drawImage(this.canvas, 0, 0);

		// Restore the grid and layer transparency states, then redraw
		this.drawGrid = originalGridState;
		this.showLayerTransparency = originalLayerTransparencyState;
		this.Draw();

		return tempCanvas;
	}

	// Export specific layer(s) as PNG (returns canvas for platform use)
	this.exportLayerPNG = function(layerIndices) {
		if (!selection || !selection.image) {
			if (window.showToast) showToast('Tileset not loaded yet', 'error');
			return null;
		}

		var tempCanvas = document.createElement('canvas');
		tempCanvas.width = this.areaW * this.cellSize;
		tempCanvas.height = this.areaH * this.cellSize;
		var tempCtx = tempCanvas.getContext('2d');
		var cs = this.cellSize;

		tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

		var layersToExport = [];
		if (layerIndices === 'all') {
			for (var i = 0; i < this.tiles.length; i++) {
				layersToExport.push(i);
			}
		} else if (Array.isArray(layerIndices)) {
			layersToExport = layerIndices.slice().sort(function(a, b) { return a - b; });
		} else {
			layersToExport = [parseInt(layerIndices)];
		}

		for (var li = 0; li < layersToExport.length; li++) {
			var layerIdx = layersToExport[li];
			if (layerIdx >= 0 && layerIdx < this.tiles.length) {
				var layer = this.tiles[layerIdx];
				for (var j = 0; j < layer.length; j++) {
					tempCtx.drawImage(selection.image,
						layer[j][2], layer[j][3], cs, cs,
						layer[j][0], layer[j][1], cs, cs);
				}
			}
		}

		return tempCanvas;
	}

	// Get current number of layers
	this.getLayerCount = function() {
		return this.tiles.length;
	}

	this.LoadMap = function(){ 
		var levels = [];
		eval($("output").value);
		if(levels.length == 0){
			//alert("Error: Unable to find levels[n]");
			return null;
		}
		// layer_s removed - no need to clear options
		editor.objects = [];
		editor.blocks = [];
		editor.tiles = [];
		lev = levels.length-1;
		//carico le info sul livello
		var settings = levels[lev][0];
		this.cellSize = settings[0];
		this.spacing = 0; // Always 0 now, ignore saved spacing value
		this.areaW = settings[2];
		this.areaH = settings[3];
		
		// Update the UI inputs with loaded values (if they exist)
		if ($("cellSize")) {
			$("cellSize").value = this.cellSize;
		}
		// $("spacing").value = 0; // Hidden field, no need to update
		if ($("mapWidth")) {
			$("mapWidth").value = this.areaW;
		}
		if ($("mapHeight")) {
			$("mapHeight").value = this.areaH;
		}
		
		// Also update the values that will be shown in modals
		this.mapWidth = this.areaW;
		this.mapHeight = this.areaH;
		
		// Update selection if it exists
		if (selection) {
			selection.cellSize = this.cellSize;
			selection.spacing = 0; // Always 0 now
			selection.updateCells();
			selection.Draw(); // Redraw the selection grid with new size
		}
		
		this.ResizeCanvas();
		//dati sui tiles
		var tiles = levels[lev][1]; 
		var cs = this.cellSize + this.spacing; 
		var cellsX = selection && selection.image ? Math.ceil(selection.image.width / cs) : 1;
		var cellsY = selection && selection.image ? Math.ceil(selection.image.height / cs) : 1;
		 
		for(var j = 0; j < tiles.length; j++){
			var layer = tiles[j];
			editor.tiles.push([]);
			for(var i = 0; i < layer.length; i++){
				var cy = Math.floor(layer[i][0] / cellsX);
				var cx = layer[i][0] - cy*cellsX;
				editor.tiles[j].push([layer[i][1]*this.cellSize, layer[i][2]*this.cellSize, cx*cs, cy*cs,layer[i][0]]);
			}
			// layer_s removed - no need to add options
		}
		
		
		//dati sui blocchi di collisione
		var blocks = levels[lev][2];
		for(var i = 0; i < blocks.length; i++){
			this.blocks.push([blocks[i][0]*this.cellSize, blocks[i][1]*this.cellSize,this.cellSize,this.cellSize]); 
		}
		
		
		//dati sugli oggetti
		var objects = levels[lev][3];
		for(var i = 0; i < objects.length; i++){
			this.objects.push([objects[i][0]*this.cellSize, objects[i][1]*this.cellSize, objects[i][2]]);			
		}
		
		
		editor.Draw();
	}
	
	 
	
	
	//image file
	var finput = $("loadFile");
	finput.onchange = function(){
		var file = this.files[0];
		var fr = new FileReader();
		fr.onload = function(){
			selection.image = new Image();
			selection.image.src = this.result;
			if (selection) selection.Draw();
		};
		fr.readAsDataURL(file);
	} 
	
	this.tiles = [[]];
	this.blocks = [];
	this.objects = [];
	this.objectId = null; //current objecty
	
	// Save current state to undo stack before making changes
	this.saveState = function() {
		// Deep clone the current state
		var state = {
			tiles: JSON.parse(JSON.stringify(this.tiles)),
			blocks: JSON.parse(JSON.stringify(this.blocks)),
			objects: JSON.parse(JSON.stringify(this.objects)),
			layer: this.layer
		};
		
		// Add to undo stack
		this.undoStack.push(state);
		
		// Limit stack size
		if (this.undoStack.length > this.maxHistorySize) {
			this.undoStack.shift(); // Remove oldest state
		}
		
		// Clear redo stack when new action is performed
		this.redoStack = [];
		
		// Update button states
		this.updateUndoRedoButtons();
	}
	
	// Perform undo operation
	this.undo = function() {
		if (this.undoStack.length === 0) {
			return;
		}
		
		// Save current state to redo stack
		var currentState = {
			tiles: JSON.parse(JSON.stringify(this.tiles)),
			blocks: JSON.parse(JSON.stringify(this.blocks)),
			objects: JSON.parse(JSON.stringify(this.objects)),
			layer: this.layer
		};
		this.redoStack.push(currentState);
		
		// Restore previous state
		var previousState = this.undoStack.pop();
		this.tiles = JSON.parse(JSON.stringify(previousState.tiles));
		this.blocks = JSON.parse(JSON.stringify(previousState.blocks));
		this.objects = JSON.parse(JSON.stringify(previousState.objects));
		this.layer = previousState.layer;
		
		// Update UI
		if ($("layer_s")) {
			$("layer_s").selectedIndex = this.layer;
		}
		if ($("currentLayerIndicator")) {
			$("currentLayerIndicator").textContent = this.layer + 1; // Display as 1-indexed
		}
		this.Draw();
		this.updateUndoRedoButtons();
	}
	
	// Perform redo operation
	this.redo = function() {
		if (this.redoStack.length === 0) {
			return;
		}
		
		// Save current state to undo stack
		var currentState = {
			tiles: JSON.parse(JSON.stringify(this.tiles)),
			blocks: JSON.parse(JSON.stringify(this.blocks)),
			objects: JSON.parse(JSON.stringify(this.objects)),
			layer: this.layer
		};
		this.undoStack.push(currentState);
		
		// Restore next state
		var nextState = this.redoStack.pop();
		this.tiles = JSON.parse(JSON.stringify(nextState.tiles));
		this.blocks = JSON.parse(JSON.stringify(nextState.blocks));
		this.objects = JSON.parse(JSON.stringify(nextState.objects));
		this.layer = nextState.layer;
		
		// Update UI
		if ($("layer_s")) {
			$("layer_s").selectedIndex = this.layer;
		}
		if ($("currentLayerIndicator")) {
			$("currentLayerIndicator").textContent = this.layer + 1; // Display as 1-indexed
		}
		this.Draw();
		this.updateUndoRedoButtons();
	}
	
	// Update undo/redo button states
	this.updateUndoRedoButtons = function() {
		var undoBtn = $("undoBtn");
		var redoBtn = $("redoBtn");
		
		if (undoBtn) {
			undoBtn.disabled = this.undoStack.length === 0;
			undoBtn.title = this.undoStack.length > 0 ? "Undo (Ctrl+Z)" : "Nothing to undo";
		}
		
		if (redoBtn) {
			redoBtn.disabled = this.redoStack.length === 0;
			redoBtn.title = this.redoStack.length > 0 ? "Redo (Ctrl+Y)" : "Nothing to redo";
		}
	}
	
	this.placeBlock = function(){ 
		// Don't place blocks if eraser tool is selected
		if (this.toolType === 'eraser') {
			return;
		}
		
		var px = Math.floor(this.mouseX /this.cellSize )*this.cellSize; 
		var py = Math.floor(this.mouseY /this.cellSize )*this.cellSize;
		
		var buffer;
		switch(this.mode){
			case 0: 
				// Ensure the layer exists
				if (!this.tiles[this.layer]) {
					this.tiles[this.layer] = [];
				}
				buffer = this.tiles[this.layer]; 
				break;
			case 1: buffer = this.blocks; break;
			case 2: buffer = this.objects; break;
		}
		
		if (!buffer) {
			return;
		}
		
		var found = -1;
		for(var i = 0; i < buffer.length; i ++){ 
			if(buffer[i][0] == px && buffer[i][1] == py){
				found = i;
				break;
			}
		}
		if(found < 0){
			// Save state only once per drag operation
			if (!this.hasUnsavedChanges) {
				this.saveState();
				this.hasUnsavedChanges = true;
			}
			
			switch(this.mode){
			case 0: 
				if (selection && selection.selected != null) {
					var tile = [px,py,selection.selectedX,selection.selectedY,selection.selected]; 
					buffer.push(tile);
				}
				break;
			case 1:
				var block = [px,py,this.cellSize,this.cellSize]; 
				buffer.push(block);	
				break;
			case 2:
				var val = (this.objectId != null) ? this.objectId : prompt("ID",null);
				if (val!=null){
					var obj = [px,py,val]; 
					buffer.push(obj);
					this.objectId  = val;
				}
				this.mouseLeft = false;
				
				break;
			}
			this.Draw();
		}
	}
	
	// Flood fill erase implementation - removes connected tiles
	this.floodFillErase = function(startX, startY) {
		// Only works in tile mode
		if (this.mode !== 0) {
			return;
		}
		
		// Ensure the layer exists
		if (!this.tiles[this.layer]) {
			return;
		}
		
		var layer = this.tiles[this.layer];
		var cellSize = this.cellSize;
		
		// Convert to grid coordinates
		var gridX = Math.floor(startX / cellSize);
		var gridY = Math.floor(startY / cellSize);
		var startPx = gridX * cellSize;
		var startPy = gridY * cellSize;
		
		// Find the tile at starting position to determine what to erase
		var targetTile = null;
		for (var i = 0; i < layer.length; i++) {
			if (layer[i][0] === startPx && layer[i][1] === startPy) {
				targetTile = layer[i];
				break;
			}
		}
		
		// If no tile at starting position, nothing to erase
		if (!targetTile) {
			return;
		}
		
		// Save state before erasing
		this.saveState();
		
		// Get the tile type to match (based on source position in tileset)
		var targetSourceX = targetTile[2];
		var targetSourceY = targetTile[3];
		
		// Create a set to track visited positions
		var visited = new Set();
		var queue = [[gridX, gridY]];
		var tilesToRemove = [];
		
		// Helper function to find tile at position
		var findTileAt = function(x, y) {
			var px = x * cellSize;
			var py = y * cellSize;
			for (var i = 0; i < layer.length; i++) {
				if (layer[i][0] === px && layer[i][1] === py) {
					return layer[i];
				}
			}
			return null;
		};
		
		// BFS flood fill erase
		while (queue.length > 0) {
			var pos = queue.shift();
			var x = pos[0];
			var y = pos[1];
			
			// Create position key
			var key = x + ',' + y;
			
			// Skip if already visited
			if (visited.has(key)) {
				continue;
			}
			
			// Mark as visited
			visited.add(key);
			
			// Check bounds
			if (x < 0 || x >= this.areaW || y < 0 || y >= this.areaH) {
				continue;
			}
			
			// Find tile at this position
			var tile = findTileAt(x, y);
			
			// Skip if no tile or different tile type
			if (!tile || tile[2] !== targetSourceX || tile[3] !== targetSourceY) {
				continue;
			}
			
			// Mark tile for removal
			tilesToRemove.push(tile);
			
			// Add neighbors to queue (4-directional)
			queue.push([x + 1, y]);
			queue.push([x - 1, y]);
			queue.push([x, y + 1]);
			queue.push([x, y - 1]);
		}
		
		// Remove all marked tiles
		for (var i = 0; i < tilesToRemove.length; i++) {
			var index = layer.indexOf(tilesToRemove[i]);
			if (index > -1) {
				layer.splice(index, 1);
			}
		}
		
		// Redraw
		this.Draw();
	}
	
	// Row fill implementation - fills entire horizontal row with selected tile
	this.fillRow = function(startX, startY) {
		// Only works in tile mode
		if (this.mode !== 0 || !selection || selection.selected == null) {
			return;
		}

		// Ensure the layer exists
		if (!this.tiles[this.layer]) {
			this.tiles[this.layer] = [];
		}

		// Save state before filling
		this.saveState();

		var layer = this.tiles[this.layer];
		var cellSize = this.cellSize;

		// Convert to grid coordinates to get the row
		var gridY = Math.floor(startY / cellSize);

		// Fill the entire row across the map width
		for (var x = 0; x < this.areaW; x++) {
			var px = x * cellSize;
			var py = gridY * cellSize;

			// Check if tile already exists at this position
			var found = false;
			for (var i = 0; i < layer.length; i++) {
				if (layer[i][0] === px && layer[i][1] === py) {
					// Tile exists, update it with new tile
					layer[i][2] = selection.selectedX;
					layer[i][3] = selection.selectedY;
					layer[i][4] = selection.selected;
					found = true;
					break;
				}
			}

			// If no tile exists, add a new one
			if (!found) {
				layer.push([px, py, selection.selectedX, selection.selectedY, selection.selected]);
			}
		}

		// Redraw
		this.Draw();
	}

	// Column fill implementation - fills entire vertical column with selected tile
	this.fillColumn = function(startX, startY) {
		// Only works in tile mode
		if (this.mode !== 0 || !selection || selection.selected == null) {
			return;
		}

		// Ensure the layer exists
		if (!this.tiles[this.layer]) {
			this.tiles[this.layer] = [];
		}

		// Save state before filling
		this.saveState();

		var layer = this.tiles[this.layer];
		var cellSize = this.cellSize;

		// Convert to grid coordinates to get the column
		var gridX = Math.floor(startX / cellSize);

		// Fill the entire column down the map height
		for (var y = 0; y < this.areaH; y++) {
			var px = gridX * cellSize;
			var py = y * cellSize;

			// Check if tile already exists at this position
			var found = false;
			for (var i = 0; i < layer.length; i++) {
				if (layer[i][0] === px && layer[i][1] === py) {
					// Tile exists, update it with new tile
					layer[i][2] = selection.selectedX;
					layer[i][3] = selection.selectedY;
					layer[i][4] = selection.selected;
					found = true;
					break;
				}
			}

			// If no tile exists, add a new one
			if (!found) {
				layer.push([px, py, selection.selectedX, selection.selectedY, selection.selected]);
			}
		}

		// Redraw
		this.Draw();
	}

	// Flood fill implementation
	this.floodFill = function(startX, startY) {
		// Only works in tile mode
		if (this.mode !== 0 || !selection || selection.selected == null) {
			return;
		}
		
		// Ensure the layer exists
		if (!this.tiles[this.layer]) {
			this.tiles[this.layer] = [];
		}
		
		// Save state before flood fill
		this.saveState();
		
		var layer = this.tiles[this.layer];
		var cellSize = this.cellSize;
		
		// Convert to grid coordinates
		var gridX = Math.floor(startX / cellSize);
		var gridY = Math.floor(startY / cellSize);
		
		// Check if tile already exists at starting position
		var startTileExists = false;
		for (var i = 0; i < layer.length; i++) {
			if (layer[i][0] === gridX * cellSize && layer[i][1] === gridY * cellSize) {
				startTileExists = true;
				break;
			}
		}
		
		// If there's already a tile at the starting position, don't fill
		if (startTileExists) {
			return;
		}
		
		// Create a set to track visited positions
		var visited = new Set();
		var queue = [[gridX, gridY]];
		var tilesToAdd = [];
		
		// Helper function to check if a tile exists at position
		var tileExistsAt = function(x, y) {
			var px = x * cellSize;
			var py = y * cellSize;
			for (var i = 0; i < layer.length; i++) {
				if (layer[i][0] === px && layer[i][1] === py) {
					return true;
				}
			}
			return false;
		};
		
		// BFS flood fill
		while (queue.length > 0) {
			var pos = queue.shift();
			var x = pos[0];
			var y = pos[1];
			
			// Create position key
			var key = x + ',' + y;
			
			// Skip if already visited
			if (visited.has(key)) {
				continue;
			}
			
			// Mark as visited
			visited.add(key);
			
			// Check bounds
			if (x < 0 || x >= this.areaW || y < 0 || y >= this.areaH) {
				continue;
			}
			
			// Check if tile already exists
			if (tileExistsAt(x, y)) {
				continue;
			}
			
			// Add tile to list
			var px = x * cellSize;
			var py = y * cellSize;
			tilesToAdd.push([px, py, selection.selectedX, selection.selectedY, selection.selected]);
			
			// Add neighbors to queue (4-directional)
			queue.push([x + 1, y]);
			queue.push([x - 1, y]);
			queue.push([x, y + 1]);
			queue.push([x, y - 1]);
		}
		
		// Add all tiles to the layer
		for (var i = 0; i < tilesToAdd.length; i++) {
			layer.push(tilesToAdd[i]);
		}
		
		// Redraw
		this.Draw();
	}
	
	this.removeBlock = function(){ 
		var px = Math.floor(this.mouseX /this.cellSize )*this.cellSize; 
		var py = Math.floor(this.mouseY /this.cellSize )*this.cellSize; 
		
		var buffer;
		switch(this.mode){
			case 0: 
				// Ensure the layer exists
				if (!this.tiles[this.layer]) {
					this.tiles[this.layer] = [];
				}
				buffer = this.tiles[this.layer]; 
				break;
			case 1: buffer = this.blocks; break;
			case 2: buffer = this.objects; break;
		}
		
		// Check if buffer exists
		if (!buffer) {
			return;
		}
		 
		for(var i = 0; i < buffer.length; i ++){ 
			if(buffer[i][0] == px && buffer[i][1] == py){
				// Save state before removing (only once per drag for eraser tool)
				if (this.toolType === 'eraser' && !this.hasUnsavedChanges) {
					this.saveState();
					this.hasUnsavedChanges = true;
				} else if (this.toolType !== 'eraser') {
					// For right-click erase, always save state
					this.saveState();
				}
				buffer.splice(i,1); 
				this.Draw();
				break;
			}
		}	
	}
	
	//Load Resources
	rh = new ResourcesHandler( function(){
		this.loaded = true;
	});
	 
	///Sprites
	//Player  
	var tilemap = document.getElementById('tilemap').value;
	console.log('Loading tileset from:', tilemap);
	// Update loading text if function exists
	if (window.updateLoadingText) {
		window.updateLoadingText('Loading Tileset', 'Preparing tile palette...');
	}
	this.imgTiles = rh.LoadImage(tilemap, function(){
		console.log('Tileset loaded, creating selection frame');
		selection = new SelectionFrame(editor.imgTiles);
		console.log('Selection frame created:', selection);
		// Update that tileset is ready
		if (window.updateLoadingText) {
			window.updateLoadingText('Almost Ready', 'Finalizing editor...');
		}
	}); 
	//menu
	this.sprLogo = rh.LoadImage("https://www.mytekos.com/beta/applications/tilemap_editor/res/logo.png");  
 
	 
	
	this.textHover = function(str, x, y, col1, col2){
		var w = editor.ctx.measureText(str).width;
		var h = 30; 
		var inside = (inputs.mouseX > x - w/2  && inputs.mouseY > y - h && inputs.mouseX < x + w/2  && inputs.mouseY < y );
		if(inside)
			editor.ctx.fillStyle = col2;
		else
			editor.ctx.fillStyle = col1;
		editor.ctx.fillText(str, x, y);
		return inside;
	};
	
	this.Draw = function(){ 
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		
		
		var w = this.areaW * this.cellSize;
		var h = this.areaH * this.cellSize;
		var cs = this.cellSize;
		
		//tiles
		if(this.drawTiles && selection && selection.image){
			if(this.drawLayer){
				// Only draw current layer
				var layer = this.tiles[this.layer];
				for(var i = 0; i < layer.length; i ++){ 
					this.ctx.drawImage(selection.image,
						layer[i][2], layer[i][3],
						cs, cs,
						layer[i][0], layer[i][1],
						cs, cs); 
				}
			}
			else{
				// Draw all layers, optionally showing other layers with reduced opacity
				for(var i = 0; i < this.tiles.length; i ++){
					var layer = this.tiles[i];
					
					// Set opacity based on whether this is the current layer and if transparency is enabled
					if (i === this.layer) {
						this.ctx.globalAlpha = 1.0; // Full opacity for current layer
					} else if (this.showLayerTransparency) {
						this.ctx.globalAlpha = 0.3; // 30% opacity for other layers when transparency is on
					} else {
						this.ctx.globalAlpha = 1.0; // Full opacity for all layers when transparency is off
					}
					
					for(var j = 0; j < layer.length; j ++){ 
						this.ctx.drawImage(selection.image,
							layer[j][2], layer[j][3],
							cs, cs,
							layer[j][0], layer[j][1],
							cs, cs); 
					}
				}
				
				// Reset opacity
				this.ctx.globalAlpha = 1.0;
			}
		}
		
		
		//grid
		// Debug: log zoom level to see what's happening
		//console.log("Current zoom:", this.zoom, "Grid enabled:", this.drawGrid, "Should show:", this.zoom >= 0.6);
		
		if(this.drawGrid && this.zoom > 0.6){
			// Only show grid when zoomed in past 60%
			this.ctx.strokeStyle = "rgba(0,0,0,0.14)";
			this.ctx.beginPath();
			for(var x = 0; x <= w; x += this.cellSize){
				// Use 0.5 offset for crisp lines at normal zoom
				var xPos = this.zoom >= 1 ? x - 0.5 : Math.round(x);
				this.ctx.moveTo(xPos, 0);
				this.ctx.lineTo(xPos, h);
			}  
			for(var y = 0; y <= h; y += this.cellSize){ 
				var yPos = this.zoom >= 1 ? y - 0.5 : Math.round(y);
				this.ctx.moveTo(0, yPos);
				this.ctx.lineTo(w, yPos); 
			} 
			this.ctx.closePath();
			this.ctx.stroke();
		}
		 
		//collision blocks
		if(this.drawBlocks){
			this.ctx.strokeStyle = "#c00";
			for(var i = 0; i < this.blocks.length; i ++){ 
				this.ctx.strokeRect(this.blocks[i][0]-0.5, this.blocks[i][1]-0.5,this.blocks[i][2], this.blocks[i][3]); 
			}
			this.ctx.strokeStyle = "#000";
		}
		
		//objects
		if(this.drawObjects){
			this.ctx.strokeStyle = "#00c"; 
			var cs2 = cs/2;
			this.ctx.textAlign = "center";
			this.ctx.textBaseline = "middle";
			for(var i = 0; i < this.objects.length; i ++){ 
				this.ctx.beginPath();
				this.ctx.arc(this.objects[i][0]+cs2-0.5, this.objects[i][1]+cs2-0.5, cs2-1, 0, 2 * Math.PI);  
				this.ctx.stroke();
				this.ctx.fillText(this.objects[i][2].substr(0,4),this.objects[i][0]+cs2 , this.objects[i][1]+cs2 )
			} 
			this.ctx.strokeStyle = "#000";
		}
	}
	
	this.Draw();
	
	
	
	this.ResetEditor = function(){ 
		this.blocks = []; 
	}
	
	// Add keyboard shortcuts for undo/redo
	var self = this;
	document.addEventListener('keydown', function(e) {
		// Check if editor exists
		if (!self) return;
		
		// Ctrl+Z for undo
		if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
			e.preventDefault();
			self.undo();
		}
		// Ctrl+Y or Ctrl+Shift+Z for redo
		else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
			e.preventDefault();
			self.redo();
		}
	});

}
 

function SelectionFrame(image){
	this.image = image;
	this.backColor = "#fff";
	this.mouseX = 0;
	this.mouseY = 0;
	this.cellSize = editor.cellSize;
	this.spacing = editor.spacing;
	
	this.SetSize = function(){
		// Let CSS handle the sizing - just set cursor
		this.div = $("SelectionDiv");
		this.div.style.cursor = "pointer";  
		this.divOpt = $("Options");
	}
	
	this.SetSize();
	
	// Function to recalculate cells based on current tile size
	this.updateCells = function() {
		// Update cellSize from editor
		this.cellSize = editor.cellSize;
		this.cellsX = Math.ceil(this.image.width / this.cellSize);
		this.cellsY = Math.ceil(this.image.height / this.cellSize);
	}
	
	this.updateCells();
	
	this.canvas = $("SelectionCanvas");
	this.canvas.setAttribute("width",this.image.width+2);
	this.canvas.setAttribute("height",this.image.height+2);
	this.canvas.onclick = function(){
		// Use the editor's cell size, not the selection's (which may be outdated)
		var cs = editor.cellSize; 
		var px = Math.floor(selection.mouseX / cs); 
		var py = Math.floor(selection.mouseY / cs); 
		selection.selected = py * selection.cellsX + px;
		selection.selectedX = px * cs;
		selection.selectedY = py * cs;
		if (selection) selection.Draw();
	};
	this.ctx = this.canvas.getContext("2d");
	
	
	
	this.selected = 0;
	this.selectedX = 0;
	this.selectedY = 0;
	
	
	
	this.Draw = function(){
		console.log('Drawing selection canvas, image dimensions:', this.image.width, 'x', this.image.height);
		this.ctx.fillStyle = this.backColor;
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		
		
		this.ctx.drawImage(this.image,0,0);
		
		// Draw grid using editor's cell size
		var cellsize = editor.cellSize;
		this.ctx.strokeStyle = "rgba(0,0,0,0.3)";
		this.ctx.beginPath();
		for(var x = 0; x <= this.image.width; x += cellsize){
			this.ctx.moveTo(x-0.5, 0);
			this.ctx.lineTo(x-0.5, this.image.height);
		}
		
		for(var y = 0; y <= this.image.height; y += cellsize){ 
			this.ctx.moveTo(0, y-0.5);
			this.ctx.lineTo(this.image.width, y-0.5);
		}
		
		this.ctx.closePath();
		this.ctx.stroke();
		
		if(this.selected != null){ 
			// Draw a more visible selection indicator
			this.ctx.strokeStyle="#ff0";
			this.ctx.lineWidth = 3;
			this.ctx.strokeRect(this.selectedX+1,this.selectedY+1,editor.cellSize-2,editor.cellSize-2);
			
			// Add inner stroke for better visibility
			this.ctx.strokeStyle="#f00";
			this.ctx.lineWidth = 1;
			this.ctx.strokeRect(this.selectedX,this.selectedY,editor.cellSize,editor.cellSize);
			
			// Reset stroke style
			this.ctx.strokeStyle="#000";
			this.ctx.lineWidth = 1;
		}
		
	}
	this.Draw();

}

window.addEventListener("mousemove", function(s) {
	// Check if editor exists before accessing
	if (!window.editor || !editor.ctx || !editor.ctx.canvas) {
		return;
	}
	
	// Handle middle mouse panning
	if(editor.isPanning && editor.mouseMiddle){
		var deltaX = s.clientX - editor.panStartX;
		var deltaY = s.clientY - editor.panStartY;
		
		editor.div.scrollLeft = editor.panStartScrollX - deltaX;
		editor.div.scrollTop = editor.panStartScrollY - deltaY;
		return; // Don't process other mouse actions while panning
	}
	
	// Get canvas bounding rectangle for accurate position
	var canvasRect = editor.ctx.canvas.getBoundingClientRect();
	
	// Calculate mouse position relative to the viewport
	var viewX = s.clientX - canvasRect.left;
	var viewY = s.clientY - canvasRect.top;
	
	// Convert to actual canvas coordinates
	// Since we're using CSS transform scale, we need to divide by the zoom
	editor.mouseX = Math.round(viewX / editor.zoom);
	editor.mouseY = Math.round(viewY / editor.zoom);
	
	if(editor.mouseLeft){
		// Handle drag actions based on tool
		if (editor.toolType === 'pencil') {
			if(selection && selection.selected != null) {
				editor.placeBlock();
			}
		} else if (editor.toolType === 'eraser') {
			editor.removeBlock();
		}
		// Fill tools don't support dragging
	}
	else if(editor.mouseRight){ 
		editor.removeBlock();
	}

	if (selection && selection.ctx && selection.ctx.canvas) {
		var selectionRect = selection.ctx.canvas.getBoundingClientRect();
		// Don't add scroll offset - getBoundingClientRect already accounts for visible position
		selection.mouseX = Math.round(s.clientX - selectionRect.left);
		selection.mouseY = Math.round(s.clientY - selectionRect.top);
	}
}, false);

window.addEventListener("mousedown", function(e) { 
	switch (e.which) {
	case 1: 
		break; 
	case 3:  
		break;
	}
}, false);


window.addEventListener("mouseup", function(e) { 
	if (!window.editor) return; // Check if editor exists first
	
	switch (e.which) {
	case 1: 
		editor.mouseLeft = false;
		// Reset the unsaved changes flag when mouse is released
		editor.hasUnsavedChanges = false; 
		break;
	case 2: // Middle mouse button
		editor.mouseMiddle = false;
		editor.isPanning = false;
		if (editor.canvas) {
			editor.canvas.style.cursor = 'default';
		}
		break;
	case 3:  
		editor.mouseRight = false;
		break;
	}
}, false);

function getQueryVariable(variable)
{
       var query = window.location.search.substring(1);
       var vars = query.split("&");
       for (var i=0;i<vars.length;i++) {
               var pair = vars[i].split("=");
               if(pair[0] == variable){return pair[1];}
       }
       return(false);
}

/*
    var xmlhttp;
    var data = new FormData();
    data.append('id', getQueryVariable("id"));
    data.append('json', blob);
    xmlhttp=new XMLHttpRequest();
    var response = '';

    //console.log(getQueryVariable("id"));


    xmlhttp.onreadystatechange = function() {
    if (xmlhttp.readyState == XMLHttpRequest.DONE) {
        var response = xmlhttp.responseText;
        if (response == 'err1') {
            window.alert("File was NOT saved! Open a new tab, log into myteklab.com, come back here and save again.");
        }
        if (response == 'err2') {
            window.alert("You do not have permissions to do this");
        }
        if (response == 'success') {
            window.alert("Saved!");
        }

    }
}

    xmlhttp.open("POST","https://www.myteklab.com/nunustudios/saveFile",true);
    xmlhttp.send(data);

*/

// Screenshot function deprecated - now handled by new save system
// Platform integration: serialize project data for saving
window.serializeProjectData = function() {
    if (editor) editor.Export();
    return JSON.stringify({
        mapData: document.getElementById('output').value,
        tilesetUrl: document.getElementById('tilemap').value
    });
};

// Platform integration: load project data from saved JSON
window.loadProjectData = function(jsonStr) {
    var data = JSON.parse(jsonStr);
    if (data.tilesetUrl) {
        document.getElementById('tilemap').value = data.tilesetUrl;
        var img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = function() {
            if (window.selection) {
                selection.image = img;
                selection.updateCells();
                selection.Draw();
            }
            if (data.mapData) {
                document.getElementById('output').value = data.mapData;
                if (window.editor) editor.LoadMap();
            }
            if (window.editor) editor.Draw();
        };
        img.onerror = function() {
            console.warn('Failed to load tileset from URL:', data.tilesetUrl);
            if (data.mapData) {
                document.getElementById('output').value = data.mapData;
                if (window.editor) editor.LoadMap();
            }
        };
        img.src = data.tilesetUrl;
    } else if (data.mapData) {
        document.getElementById('output').value = data.mapData;
        if (window.editor) editor.LoadMap();
    }
};
