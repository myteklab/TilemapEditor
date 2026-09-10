var editor = null;
var selection = null;

function StartEditor(){
	editor = new Editor(50, 30);
}

// Tiles are stored per layer as [px, py, srcX, srcY, tileIndex]: canvas pixel
// position, tileset pixel position, and the index the saved format keeps.
// Index is the only one that survives a save, srcX/srcY are recomputed from it
// on load using the tileset width, so the two must always agree.
function Editor(areaW, areaH){
	this.areaW = areaW;
	this.areaH = areaH;
	this.cellSize = 16;
	this.spacing = 0;

	this.zoom = 1;
	this.minZoom = 0.25;
	this.maxZoom = 4;
	this.zoomStep = 0.25;

	this.div = $("EditorDiv");
	this.div.style.cursor = "copy";
	this.canvas = $("EditorCanvas");
	this.ctx = this.canvas.getContext("2d");

	// Set by the page: called after any zoom or canvas resize so the hover
	// overlay and status bar can follow.
	this.onViewChange = null;
	this.onHistoryChange = null;

	this.ResizeCanvas = function(){
		this.canvas.width = this.areaW * this.cellSize;
		this.canvas.height = this.areaH * this.cellSize;
		this.canvas.style.width = '';
		this.canvas.style.height = '';
		this.applyZoom();
	}

	this.applyZoom = function(){
		// CSS scale keeps the canvas crisp (image-rendering: pixelated) where
		// resizing the bitmap would blur it and cost a redraw per zoom step.
		this.canvas.style.transform = 'scale(' + this.zoom + ')';
		this.canvas.style.transformOrigin = 'top left';

		// A transformed element keeps its layout box, so the scroll container
		// does not grow with the zoom. The spacer does that job.
		var spacer = $('editorSpacer');
		if (!spacer) {
			spacer = document.createElement('div');
			spacer.id = 'editorSpacer';
			spacer.style.position = 'absolute';
			spacer.style.pointerEvents = 'none';
			spacer.style.opacity = '0';
			this.div.appendChild(spacer);
		}
		spacer.style.width = (this.areaW * this.cellSize * this.zoom + 100) + 'px';
		spacer.style.height = (this.areaH * this.cellSize * this.zoom + 100) + 'px';
		if (this.onViewChange) this.onViewChange();
	}

	this.setZoom = function(z, anchorX, anchorY){
		z = Math.max(this.minZoom, Math.min(this.maxZoom, z));
		if (z === this.zoom) return;
		// Keep the point under the anchor (mouse, or the view center) still.
		var rect = this.canvas.getBoundingClientRect();
		var divRect = this.div.getBoundingClientRect();
		if (anchorX === undefined) { anchorX = divRect.left + divRect.width / 2; anchorY = divRect.top + divRect.height / 2; }
		var cx = (anchorX - rect.left) / this.zoom;
		var cy = (anchorY - rect.top) / this.zoom;
		this.zoom = z;
		this.applyZoom();
		var after = this.canvas.getBoundingClientRect();
		this.div.scrollLeft += (after.left + cx * this.zoom) - anchorX;
		this.div.scrollTop += (after.top + cy * this.zoom) - anchorY;
		this.Draw();
	}
	this.zoomIn = function(){ this.setZoom(this.zoom + this.zoomStep); }
	this.zoomOut = function(){ this.setZoom(this.zoom - this.zoomStep); }
	this.resetZoom = function(){
		this.setZoom(1);
		this.div.scrollLeft = (this.canvas.offsetWidth - this.div.offsetWidth) / 2;
		this.div.scrollTop = (this.canvas.offsetHeight - this.div.offsetHeight) / 2;
	}

	this.ResizeCanvas();

	var self = this;

	this.canvas.addEventListener('contextmenu', function (event) {
		event.preventDefault();
	});

	this.startPan = function(e){
		this.isPanning = true;
		this.panStartX = e.clientX;
		this.panStartY = e.clientY;
		this.panStartScrollX = this.div.scrollLeft;
		this.panStartScrollY = this.div.scrollTop;
		this.div.style.cursor = 'grabbing';
	}
	this.endPan = function(){
		this.isPanning = false;
		this.div.style.cursor = this.spacePan ? 'grab' : 'copy';
	}

	this.canvas.addEventListener("mousedown", function(e){
		if (e.button === 1 || (e.button === 0 && self.spacePan)) {
			e.preventDefault();
			self.startPan(e);
			return;
		}
		if (self.mode === 0 && !self.isLayerVisible(self.layer)) {
			if (window.showToast) showToast('Layer ' + (self.layer + 1) + ' is hidden. Show it in the Layer menu to draw on it.', 'info');
			return;
		}
		if (e.button === 0) {
			self.mouseLeft = true;
			self.strokeOpen = false;
			var hasTile = selection && selection.selected != null;
			switch (self.toolType) {
				case 'fill': if (hasTile) self.floodFill(self.mouseX, self.mouseY); break;
				case 'fillErase': self.floodFillErase(self.mouseX, self.mouseY); break;
				case 'rowFill': if (hasTile) self.fillRow(self.mouseX, self.mouseY); break;
				case 'columnFill': if (hasTile) self.fillColumn(self.mouseX, self.mouseY); break;
				case 'eraser': self.removeBlock(); break;
				default: if (hasTile) self.placeBlock();
			}
		}
		else if (e.button === 2) {
			self.mouseRight = true;
			self.strokeOpen = false;
			self.removeBlock();
		}
	});

	// Middle click auto-scroll would fight the pan.
	this.div.addEventListener('mousedown', function(e) {
		if (e.button === 1) e.preventDefault();
	});

	this.div.addEventListener('wheel', function(e) {
		e.preventDefault();
		// deltaMode 1 is lines, 2 is pages; trackpads send small pixel deltas
		// and wheels send big ones, so the step is proportional and clamped.
		var deltaY = e.deltaY;
		if (e.deltaMode === 1) deltaY *= 20;
		if (e.deltaMode === 2) deltaY *= 400;
		var delta = Math.max(-0.2, Math.min(0.2, -deltaY * 0.002));
		self.setZoom(self.zoom + delta, e.clientX, e.clientY);
	}, { passive: false });

	this.mouseX = 0;
	this.mouseY = 0;
	this.mouseLeft = false;
	this.mouseRight = false;
	this.spacePan = false;
	this.isPanning = false;

	this.drawGrid = true;
	this.drawTiles = true;
	this.drawBlocks = true;
	this.drawObjects = true;
	this.drawLayer = false;
	this.showLayerTransparency = true;

	// mode 1 (collision) and 2 (objects) survive in the save format and the
	// drawing code, but the editor no longer exposes them. Left in so old maps
	// keep their data through a load/save round trip.
	this.mode = 0;
	this.layer = 0;
	this.toolType = 'pencil';

	this.undoStack = [];
	this.redoStack = [];
	this.maxHistorySize = 50;
	// One undo step per drag, not per cell.
	this.strokeOpen = false;

	this.tiles = [[]];
	this.blocks = [];
	this.objects = [];
	this.objectId = null;
	// One {name, visible} per layer. Saved as the fifth element of a level,
	// which loaders that only know four ignore.
	this.layerMeta = [{ name: '', visible: true }];

	this.metaFor = function(i){
		if (!this.layerMeta[i]) this.layerMeta[i] = { name: '', visible: true };
		return this.layerMeta[i];
	}
	this.isLayerVisible = function(i){ return this.metaFor(i).visible !== false; }
	// Not an undo step: hiding a layer is a view choice, like the grid.
	this.setLayerVisible = function(i, on){ this.metaFor(i).visible = !!on; this.Draw(); }
	this.renameLayer = function(i, name){
		name = String(name || '').trim().slice(0, 40);
		if (name === this.metaFor(i).name) return;
		this.saveState();
		this.metaFor(i).name = name;
	}

	this.tilesetUrl = function(){
		var el = $("tilemap");
		return el ? el.value : '';
	}

	// Everything undo needs to put the editor back, including the map size,
	// the tile size and which tileset was loaded.
	this.snapshot = function(){
		return {
			tiles: JSON.parse(JSON.stringify(this.tiles)),
			blocks: JSON.parse(JSON.stringify(this.blocks)),
			objects: JSON.parse(JSON.stringify(this.objects)),
			layerMeta: JSON.parse(JSON.stringify(this.layerMeta)),
			layer: this.layer,
			areaW: this.areaW,
			areaH: this.areaH,
			cellSize: this.cellSize,
			tileset: this.tilesetUrl()
		};
	}

	this.restore = function(state){
		this.tiles = JSON.parse(JSON.stringify(state.tiles));
		this.blocks = JSON.parse(JSON.stringify(state.blocks));
		this.objects = JSON.parse(JSON.stringify(state.objects));
		this.layerMeta = JSON.parse(JSON.stringify(state.layerMeta || []));
		this.layer = Math.min(state.layer, this.tiles.length - 1);
		var sizeChanged = state.areaW !== this.areaW || state.areaH !== this.areaH || state.cellSize !== this.cellSize;
		this.areaW = state.areaW;
		this.areaH = state.areaH;
		this.cellSize = state.cellSize;
		if (sizeChanged) {
			this.ResizeCanvas();
			if (selection) { selection.updateCells(); selection.Draw(); }
		}
		if (state.tileset && state.tileset !== this.tilesetUrl()) {
			$("tilemap").value = state.tileset;
			this.loadTilesetImage(state.tileset, function(){ self.Draw(); });
		}
		if ($("currentLayerIndicator")) $("currentLayerIndicator").textContent = this.layer + 1;
		this.Draw();
	}

	this.saveState = function() {
		this.undoStack.push(this.snapshot());
		if (this.undoStack.length > this.maxHistorySize) this.undoStack.shift();
		this.redoStack = [];
		if (this.onHistoryChange) this.onHistoryChange();
	}

	this.undo = function() {
		if (this.undoStack.length === 0) return;
		this.redoStack.push(this.snapshot());
		this.restore(this.undoStack.pop());
		if (this.onHistoryChange) this.onHistoryChange();
	}

	this.redo = function() {
		if (this.redoStack.length === 0) return;
		this.undoStack.push(this.snapshot());
		this.restore(this.redoStack.pop());
		if (this.onHistoryChange) this.onHistoryChange();
	}

	// Loads a tileset image and hands it to the palette. Falls back to the
	// bundled tileset when the URL is dead so the map still draws something.
	this.tilesetLoadSeq = 0;
	this.loadTilesetImage = function(url, done){
		// The bundled tileset and a project's own are often in flight together
		// at startup; whichever was asked for last is the one that counts.
		var seq = ++this.tilesetLoadSeq;
		var img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = function(){
			if (seq !== self.tilesetLoadSeq) return;
			self.imgTiles = img;
			if (selection) {
				selection.image = img;
				selection.selected = null;
				selection.updateCells();
				selection.Draw();
			} else {
				selection = new SelectionFrame(img);
			}
			if (done) done(true);
		};
		img.onerror = function(){
			if (seq !== self.tilesetLoadSeq) return;
			console.warn('Could not load tileset: ' + url);
			if (url !== 'res/tileset.png') {
				self.loadTilesetImage('res/tileset.png', done);
			} else if (done) {
				done(false);
			}
		};
		img.src = url;
	}

	// Serialize to the level format: [settings, tiles per layer, collision, objects],
	// tiles as [index, gridX, gridY]. Written into #output, which is what the
	// platform save reads.
	this.Export = function(){
		var cs = this.cellSize;
		var level = [
			[cs, 0, this.areaW, this.areaH],
			this.tiles.map(function(layer){
				return layer.map(function(t){ return [t[4], t[0] / cs, t[1] / cs]; });
			}),
			this.blocks.map(function(b){ return [b[0] / cs, b[1] / cs]; }),
			this.objects.map(function(o){ return [o[0] / cs, o[1] / cs, String(o[2])]; }),
			this.tiles.map(function(layer, i){ var m = self.metaFor(i); return [m.name || '', m.visible === false ? 0 : 1]; })
		];
		$("output").value = "levels[1] = " + JSON.stringify(level) + ";";
	}

	// Reads either form the editor has ever written: "var levels = [[...]]"
	// (a list of levels) or "levels[1] = [...]" (one level). The old loader
	// eval'd this, which ran whatever was in a shared project's save.
	this.parseLevel = function(text){
		// The array starts after the assignment: "levels[1]" has a bracket of its own.
		var eq = text.indexOf('=');
		var s = text.indexOf('[', eq < 0 ? 0 : eq), e = text.lastIndexOf(']');
		if (s < 0 || e < s) return null;
		var body = text.slice(s, e + 1);
		var parsed = null;
		try { parsed = JSON.parse(body); }
		catch (err) {
			try { parsed = JSON.parse(body.replace(/,\s*([\]}])/g, '$1')); } catch (err2) { return null; }
		}
		if (!Array.isArray(parsed) || parsed.length === 0) return null;
		// A level starts with its settings row of four numbers; a list of
		// levels starts with a level.
		var level = (Array.isArray(parsed[0]) && typeof parsed[0][0] === 'number') ? parsed : parsed[parsed.length - 1];
		if (!Array.isArray(level) || !Array.isArray(level[0]) || level[0].length < 4) return null;
		return level;
	}

	this.LoadMap = function(){
		var level = this.parseLevel($("output").value);
		if (!level) {
			if (window.showToast) showToast('Could not read the map data, so the map was left as it is.', 'error');
			return null;
		}
		var settings = level[0];
		this.cellSize = settings[0];
		this.spacing = 0;
		this.areaW = settings[2];
		this.areaH = settings[3];
		this.tiles = [];
		this.blocks = [];
		this.objects = [];

		if (selection) {
			selection.updateCells();
			selection.Draw();
		}
		this.ResizeCanvas();

		var cs = this.cellSize;
		var cellsX = selection && selection.image ? Math.ceil(selection.image.width / cs) : 1;
		var layers = level[1] || [];
		for (var j = 0; j < layers.length; j++) {
			var layer = [];
			for (var i = 0; i < layers[j].length; i++) {
				var t = layers[j][i];
				var cy = Math.floor(t[0] / cellsX);
				var cx = t[0] - cy * cellsX;
				layer.push([t[1] * cs, t[2] * cs, cx * cs, cy * cs, t[0]]);
			}
			this.tiles.push(layer);
		}
		if (this.tiles.length === 0) this.tiles.push([]);
		if (this.layer >= this.tiles.length) this.layer = 0;
		var meta = level[4] || [];
		this.layerMeta = this.tiles.map(function(layer, i){
			return { name: meta[i] ? String(meta[i][0] || '') : '', visible: meta[i] ? meta[i][1] !== 0 : true };
		});

		var blocks = level[2] || [];
		for (var i = 0; i < blocks.length; i++) {
			this.blocks.push([blocks[i][0] * cs, blocks[i][1] * cs, cs, cs]);
		}
		var objects = level[3] || [];
		for (var i = 0; i < objects.length; i++) {
			this.objects.push([objects[i][0] * cs, objects[i][1] * cs, objects[i][2]]);
		}
		this.Draw();
		return level;
	}

	// Map, blocks and objects keep their grid positions; anything now outside
	// the map is dropped. Undo brings it back.
	this.resizeMap = function(w, h){
		this.saveState();
		var cs = this.cellSize, maxX = w * cs, maxY = h * cs;
		var inside = function(t){ return t[0] < maxX && t[1] < maxY; };
		for (var l = 0; l < this.tiles.length; l++) this.tiles[l] = this.tiles[l].filter(inside);
		this.blocks = this.blocks.filter(inside);
		this.objects = this.objects.filter(inside);
		this.areaW = w;
		this.areaH = h;
		this.ResizeCanvas();
		this.Draw();
	}

	// Positions stay on the same grid cell. The tileset region a tile pointed
	// at is snapped to the new grid, so the index stays consistent with what
	// LoadMap will compute from it later.
	this.setTileSize = function(size){
		if (size === this.cellSize) return;
		this.saveState();
		var old = this.cellSize;
		var imgW = selection && selection.image ? selection.image.width : size;
		var cellsX = Math.max(1, Math.ceil(imgW / size));
		var snap = function(t){
			var gx = Math.round(t[0] / old), gy = Math.round(t[1] / old);
			var cx = Math.floor(t[2] / size), cy = Math.floor(t[3] / size);
			return [gx * size, gy * size, cx * size, cy * size, cy * cellsX + cx];
		};
		for (var l = 0; l < this.tiles.length; l++) this.tiles[l] = this.tiles[l].map(snap);
		this.blocks = this.blocks.map(function(b){ return [Math.round(b[0] / old) * size, Math.round(b[1] / old) * size, size, size]; });
		this.objects = this.objects.map(function(o){ return [Math.round(o[0] / old) * size, Math.round(o[1] / old) * size, o[2]]; });
		this.cellSize = size;
		this.ResizeCanvas();
		if (selection) {
			selection.selected = null;
			selection.updateCells();
			selection.Draw();
		}
		this.Draw();
	}

	this.setTileset = function(url, done){
		if (!url) return;
		this.loadTilesetImage(url, function(ok){
			if (!ok) { if (done) done(false); return; }
			self.saveState();
			$("tilemap").value = url;
			// The undo snapshot above recorded the old URL; the tiles keep their
			// indexes, so they point at the same cells of the new sheet.
			self.Draw();
			if (done) done(true);
		});
	}

	this.currentBuffer = function(){
		switch (this.mode) {
			case 1: return this.blocks;
			case 2: return this.objects;
			default:
				if (!this.tiles[this.layer]) this.tiles[this.layer] = [];
				return this.tiles[this.layer];
		}
	}

	this.cellUnderMouse = function(){
		return [Math.floor(this.mouseX / this.cellSize) * this.cellSize,
			Math.floor(this.mouseY / this.cellSize) * this.cellSize];
	}

	this.inBounds = function(px, py){
		return px >= 0 && py >= 0 && px < this.areaW * this.cellSize && py < this.areaH * this.cellSize;
	}

	this.openStroke = function(){
		if (!this.strokeOpen) {
			this.saveState();
			this.strokeOpen = true;
		}
	}

	// The picked block repeated across the map, anchored at grid cell (ax, ay):
	// what a fill or a line tool should put at (gx, gy). Returns [sx, sy, index].
	this.stampTile = function(gx, gy, ax, ay){
		var w = selection.stampW || 1, h = selection.stampH || 1;
		var c = ((gx - ax) % w + w) % w, r = ((gy - ay) % h + h) % h;
		return selection.tileFor(c, r);
	}

	// Puts one tile on a layer, replacing whatever is there. True if it changed.
	this.putTile = function(layer, gx, gy, t){
		var px = gx * this.cellSize, py = gy * this.cellSize;
		for (var i = 0; i < layer.length; i++) {
			if (layer[i][0] === px && layer[i][1] === py) {
				if (layer[i][4] === t[2]) return false;
				layer[i][2] = t[0]; layer[i][3] = t[1]; layer[i][4] = t[2];
				return true;
			}
		}
		layer.push([px, py, t[0], t[1], t[2]]);
		return true;
	}

	this.placeBlock = function(){
		var cell = this.cellUnderMouse(), px = cell[0], py = cell[1];
		if (!this.inBounds(px, py)) return;
		var buffer = this.currentBuffer();
		var found = -1;
		for (var i = 0; i < buffer.length; i++) {
			if (buffer[i][0] == px && buffer[i][1] == py) { found = i; break; }
		}
		switch (this.mode) {
			case 0:
				if (!selection || selection.selected == null) return;
				var gx = px / this.cellSize, gy = py / this.cellSize;
				var w = selection.stampW || 1, h = selection.stampH || 1;
				// Find what would change before opening the undo step, so a
				// drag over already-painted cells stays free.
				var pending = [];
				for (var r = 0; r < h; r++) {
					for (var c = 0; c < w; c++) {
						if (gx + c >= this.areaW || gy + r >= this.areaH) continue;
						var t = selection.tileFor(c, r);
						var existing = this.tileAt(buffer, gx + c, gy + r);
						if (!existing || existing[4] !== t[2]) pending.push([gx + c, gy + r, t]);
					}
				}
				if (pending.length === 0) return;
				this.openStroke();
				for (var k = 0; k < pending.length; k++) this.putTile(buffer, pending[k][0], pending[k][1], pending[k][2]);
				break;
			case 1:
				if (found >= 0) return;
				this.openStroke();
				buffer.push([px, py, this.cellSize, this.cellSize]);
				break;
			case 2:
				if (found >= 0) return;
				var val = (this.objectId != null) ? this.objectId : prompt("ID", null);
				if (val == null) { this.mouseLeft = false; return; }
				this.openStroke();
				buffer.push([px, py, val]);
				this.objectId = val;
				this.mouseLeft = false;
				break;
		}
		this.Draw();
	}

	this.removeBlock = function(){
		var cell = this.cellUnderMouse(), px = cell[0], py = cell[1];
		var buffer = this.currentBuffer();
		for (var i = 0; i < buffer.length; i++) {
			if (buffer[i][0] == px && buffer[i][1] == py) {
				this.openStroke();
				buffer.splice(i, 1);
				this.Draw();
				return;
			}
		}
	}

	this.tileAt = function(layer, gx, gy){
		var px = gx * this.cellSize, py = gy * this.cellSize;
		for (var i = 0; i < layer.length; i++) {
			if (layer[i][0] === px && layer[i][1] === py) return layer[i];
		}
		return null;
	}

	// 4-way flood over the current layer from a grid cell. `match` decides
	// whether a cell belongs to the region, `visit` gets each cell once.
	this.flood = function(layer, gridX, gridY, match, visit){
		var visited = {};
		var queue = [[gridX, gridY]];
		while (queue.length > 0) {
			var pos = queue.shift(), x = pos[0], y = pos[1];
			var key = x + ',' + y;
			if (visited[key]) continue;
			visited[key] = true;
			if (x < 0 || x >= this.areaW || y < 0 || y >= this.areaH) continue;
			var tile = this.tileAt(layer, x, y);
			if (!match(tile)) continue;
			visit(x, y, tile);
			queue.push([x + 1, y]); queue.push([x - 1, y]); queue.push([x, y + 1]); queue.push([x, y - 1]);
		}
	}

	// Fills the connected region under the click: empty cells if you click on
	// empty, otherwise every connected tile of the same kind gets replaced.
	this.floodFill = function(startX, startY) {
		if (this.mode !== 0 || !selection || selection.selected == null) return;
		var layer = this.currentBuffer();
		var cs = this.cellSize;
		var gridX = Math.floor(startX / cs), gridY = Math.floor(startY / cs);
		if (gridX < 0 || gridY < 0 || gridX >= this.areaW || gridY >= this.areaH) return;
		var start = this.tileAt(layer, gridX, gridY);
		var target = start ? start[4] : null;
		var single = (selection.stampW || 1) === 1 && (selection.stampH || 1) === 1;
		if (single && target === selection.selected) return;
		var self2 = this, region = [];
		this.flood(layer, gridX, gridY,
			function(tile){ return (tile ? tile[4] : null) === target; },
			function(x, y, tile){ region.push([x, y]); });
		if (region.length === 0) return;
		this.saveState();
		for (var i = 0; i < region.length; i++) {
			this.putTile(layer, region[i][0], region[i][1], this.stampTile(region[i][0], region[i][1], gridX, gridY));
		}
		this.Draw();
	}

	// Removes the connected tiles of the kind under the click.
	this.floodFillErase = function(startX, startY) {
		if (this.mode !== 0) return;
		var layer = this.currentBuffer();
		var cs = this.cellSize;
		var gridX = Math.floor(startX / cs), gridY = Math.floor(startY / cs);
		var start = this.tileAt(layer, gridX, gridY);
		if (!start) return;
		var target = start[4];
		var doomed = [];
		this.flood(layer, gridX, gridY,
			function(tile){ return !!tile && tile[4] === target; },
			function(x, y, tile){ doomed.push(tile); });
		this.saveState();
		for (var i = 0; i < doomed.length; i++) {
			var at = layer.indexOf(doomed[i]);
			if (at > -1) layer.splice(at, 1);
		}
		this.Draw();
	}

	// Grid cells, patterned from the clicked cell (ax, ay).
	this.fillCells = function(cells, ax, ay){
		var layer = this.currentBuffer();
		for (var c = 0; c < cells.length; c++) {
			this.putTile(layer, cells[c][0], cells[c][1], this.stampTile(cells[c][0], cells[c][1], ax, ay));
		}
		this.Draw();
	}

	this.fillRow = function(startX, startY) {
		if (this.mode !== 0 || !selection || selection.selected == null) return;
		var cs = this.cellSize, gx = Math.floor(startX / cs), gy = Math.floor(startY / cs);
		if (gy < 0 || gy >= this.areaH) return;
		this.saveState();
		var cells = [];
		for (var x = 0; x < this.areaW; x++) cells.push([x, gy]);
		this.fillCells(cells, gx, gy);
	}

	this.fillColumn = function(startX, startY) {
		if (this.mode !== 0 || !selection || selection.selected == null) return;
		var cs = this.cellSize, gx = Math.floor(startX / cs), gy = Math.floor(startY / cs);
		if (gx < 0 || gx >= this.areaW) return;
		this.saveState();
		var cells = [];
		for (var y = 0; y < this.areaH; y++) cells.push([gx, y]);
		this.fillCells(cells, gx, gy);
	}

	this.addLayer = function(){
		if (this.tiles.length >= 10) return false;
		this.saveState();
		this.tiles.push([]);
		this.layerMeta.push({ name: '', visible: true });
		this.layer = this.tiles.length - 1;
		this.Draw();
		return true;
	}

	this.removeLayer = function(index){
		if (this.tiles.length <= 1) return false;
		this.saveState();
		this.tiles.splice(index, 1);
		this.layerMeta.splice(index, 1);
		if (this.layer >= this.tiles.length) this.layer = this.tiles.length - 1;
		this.Draw();
		return true;
	}

	this.clearLayer = function(index){
		if (!this.tiles[index] || this.tiles[index].length === 0) return false;
		this.saveState();
		this.tiles[index] = [];
		this.Draw();
		return true;
	}

	this.getLayerCount = function() {
		return this.tiles.length;
	}

	// The map with no grid and every layer at full opacity, for previews.
	this.exportScreenshot = function() {
		var grid = this.drawGrid, transparency = this.showLayerTransparency, only = this.drawLayer;
		this.drawGrid = false;
		this.showLayerTransparency = false;
		this.drawLayer = false;
		this.Draw();
		var tempCanvas = document.createElement('canvas');
		tempCanvas.width = this.areaW * this.cellSize;
		tempCanvas.height = this.areaH * this.cellSize;
		tempCanvas.getContext('2d').drawImage(this.canvas, 0, 0);
		this.drawGrid = grid;
		this.showLayerTransparency = transparency;
		this.drawLayer = only;
		this.Draw();
		return tempCanvas;
	}

	// Transparent PNG of the chosen layers, bottom layer first.
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
		var wanted = [];
		if (layerIndices === 'all') {
			for (var i = 0; i < this.tiles.length; i++) wanted.push(i);
		} else if (Array.isArray(layerIndices)) {
			wanted = layerIndices.slice().sort(function(a, b) { return a - b; });
		} else {
			wanted = [parseInt(layerIndices)];
		}
		for (var li = 0; li < wanted.length; li++) {
			var layer = this.tiles[wanted[li]];
			if (!layer) continue;
			for (var j = 0; j < layer.length; j++) {
				tempCtx.drawImage(selection.image, layer[j][2], layer[j][3], cs, cs, layer[j][0], layer[j][1], cs, cs);
			}
		}
		return tempCanvas;
	}

	this.Draw = function(){
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		var w = this.areaW * this.cellSize;
		var h = this.areaH * this.cellSize;
		var cs = this.cellSize;

		if (this.drawTiles && selection && selection.image) {
			for (var i = 0; i < this.tiles.length; i++) {
				var layer = this.tiles[i];
				if (!layer || !this.isLayerVisible(i)) continue;
				if (this.drawLayer && i !== this.layer) continue;
				this.ctx.globalAlpha = (i === this.layer || !this.showLayerTransparency || this.drawLayer) ? 1.0 : 0.3;
				for (var j = 0; j < layer.length; j++) {
					this.ctx.drawImage(selection.image, layer[j][2], layer[j][3], cs, cs, layer[j][0], layer[j][1], cs, cs);
				}
			}
			this.ctx.globalAlpha = 1.0;
		}

		// Below 60% the grid is denser than the tiles and just turns the map gray.
		if (this.drawGrid && this.zoom > 0.6) {
			this.ctx.strokeStyle = "rgba(0,0,0,0.14)";
			this.ctx.lineWidth = 1;
			this.ctx.beginPath();
			for (var x = 0; x <= w; x += cs) {
				var xPos = this.zoom >= 1 ? x - 0.5 : Math.round(x);
				this.ctx.moveTo(xPos, 0);
				this.ctx.lineTo(xPos, h);
			}
			for (var y = 0; y <= h; y += cs) {
				var yPos = this.zoom >= 1 ? y - 0.5 : Math.round(y);
				this.ctx.moveTo(0, yPos);
				this.ctx.lineTo(w, yPos);
			}
			this.ctx.stroke();
		}

		if (this.drawBlocks) {
			this.ctx.strokeStyle = "#c00";
			for (var i = 0; i < this.blocks.length; i++) {
				this.ctx.strokeRect(this.blocks[i][0] - 0.5, this.blocks[i][1] - 0.5, this.blocks[i][2], this.blocks[i][3]);
			}
		}

		if (this.drawObjects) {
			this.ctx.strokeStyle = "#00c";
			this.ctx.fillStyle = "#00c";
			var cs2 = cs / 2;
			this.ctx.textAlign = "center";
			this.ctx.textBaseline = "middle";
			for (var i = 0; i < this.objects.length; i++) {
				this.ctx.beginPath();
				this.ctx.arc(this.objects[i][0] + cs2 - 0.5, this.objects[i][1] + cs2 - 0.5, cs2 - 1, 0, 2 * Math.PI);
				this.ctx.stroke();
				this.ctx.fillText(String(this.objects[i][2]).substr(0, 4), this.objects[i][0] + cs2, this.objects[i][1] + cs2);
			}
		}
		this.ctx.strokeStyle = "#000";
	}

	this.Draw();

	document.addEventListener('keydown', function(e) {
		var tag = e.target && e.target.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
			e.preventDefault();
			self.undo();
		} else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
			e.preventDefault();
			self.redo();
		}
	});

	var tilemap = this.tilesetUrl() || 'res/tileset.png';
	if (window.updateLoadingText) window.updateLoadingText('Loading Tileset', 'Preparing tile palette...');
	this.loadTilesetImage(tilemap, function(){
		if (window.updateLoadingText) window.updateLoadingText('Almost Ready', 'Finalizing editor...');
	});
}


// The tileset palette on the right. Drawn 1:1 into its canvas and scaled with
// CSS so small tiles stay pickable.
function SelectionFrame(image){
	this.image = image;
	this.mouseX = 0;
	this.mouseY = 0;
	this.cellSize = editor.cellSize;
	this.scale = 1;
	this.selected = null;
	this.selectedX = 0;
	this.selectedY = 0;
	// A picked block is stampW x stampH cells with `selected` its top-left.
	this.stampW = 1;
	this.stampH = 1;
	this.dragStart = null;

	this.div = $("SelectionDiv");
	this.canvas = $("SelectionCanvas");
	this.ctx = this.canvas.getContext("2d");
	this.canvas.style.cursor = "pointer";

	this.updateCells = function() {
		this.cellSize = editor.cellSize;
		this.cellsX = Math.max(1, Math.ceil(this.image.width / this.cellSize));
		this.cellsY = Math.max(1, Math.ceil(this.image.height / this.cellSize));
		this.canvas.width = this.image.width;
		this.canvas.height = this.image.height;
		this.setScale(this.scale);
	}

	this.setScale = function(s){
		this.scale = Math.max(1, Math.min(6, s));
		this.canvas.style.width = (this.canvas.width * this.scale) + 'px';
		this.canvas.style.height = (this.canvas.height * this.scale) + 'px';
	}

	this.tileCount = function(){
		return this.cellsX * this.cellsY;
	}

	this.select = function(index){
		if (index == null || index < 0 || index >= this.tileCount()) { this.selected = null; this.Draw(); return; }
		var py = Math.floor(index / this.cellsX), px = index - py * this.cellsX;
		this.selectRange(px, py, px, py);
	}

	this.selectRange = function(x0, y0, x1, y1){
		var cs = editor.cellSize;
		var l = Math.min(x0, x1), t = Math.min(y0, y1);
		// Big enough for a house, small enough that the hover ghost stays cheap.
		var r = Math.min(Math.max(x0, x1), l + 15), b = Math.min(Math.max(y0, y1), t + 15);
		this.stampW = r - l + 1;
		this.stampH = b - t + 1;
		this.selected = t * this.cellsX + l;
		this.selectedX = l * cs;
		this.selectedY = t * cs;
		this.Draw();
		if (window.onTileSelected) window.onTileSelected(this.selected);
	}

	// Tile (c, r) cells into the picked block: [srcX, srcY, index].
	this.tileFor = function(c, r){
		var cs = editor.cellSize;
		var col = this.selectedX / cs + c, row = this.selectedY / cs + r;
		return [col * cs, row * cs, row * this.cellsX + col];
	}

	// Palette cell under the mouse; clamped to the sheet while dragging so a
	// drag past the edge still ends on the last tile.
	this.cellAt = function(clamp){
		var cs = editor.cellSize;
		var px = Math.floor(this.mouseX / cs), py = Math.floor(this.mouseY / cs);
		if (clamp) return [Math.max(0, Math.min(this.cellsX - 1, px)), Math.max(0, Math.min(this.cellsY - 1, py))];
		if (px < 0 || py < 0 || px >= this.cellsX || py >= this.cellsY) return null;
		return [px, py];
	}

	this.dragTo = function(){
		var c = this.cellAt(true);
		if (this.dragStart) this.selectRange(this.dragStart[0], this.dragStart[1], c[0], c[1]);
	}

	var self = this;
	this.canvas.addEventListener('mousedown', function(e){
		if (e.button !== 0) return;
		e.preventDefault();
		var c = self.cellAt(false);
		if (!c) return;
		self.dragStart = c;
		self.selectRange(c[0], c[1], c[0], c[1]);
	});

	this.Draw = function(){
		var cs = editor.cellSize;
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.imageSmoothingEnabled = false;
		this.ctx.drawImage(this.image, 0, 0);

		this.ctx.strokeStyle = "rgba(0,0,0,0.3)";
		this.ctx.lineWidth = 1;
		this.ctx.beginPath();
		// The last line sits inside the edge, so the outer cells get a border too.
		var w = this.image.width, h = this.image.height;
		for (var x = 0; x <= w; x += cs) {
			var lx = Math.min(x, w) - 0.5;
			this.ctx.moveTo(x === 0 ? 0.5 : lx, 0);
			this.ctx.lineTo(x === 0 ? 0.5 : lx, h);
		}
		for (var y = 0; y <= h; y += cs) {
			var ly = Math.min(y, h) - 0.5;
			this.ctx.moveTo(0, y === 0 ? 0.5 : ly);
			this.ctx.lineTo(w, y === 0 ? 0.5 : ly);
		}
		this.ctx.stroke();

		if (this.selected != null) {
			var sw = this.stampW * cs, sh = this.stampH * cs;
			this.ctx.strokeStyle = "#ff0";
			this.ctx.lineWidth = 3;
			this.ctx.strokeRect(this.selectedX + 1, this.selectedY + 1, sw - 2, sh - 2);
			this.ctx.strokeStyle = "#f00";
			this.ctx.lineWidth = 1;
			this.ctx.strokeRect(this.selectedX, this.selectedY, sw, sh);
		}
		this.ctx.strokeStyle = "#000";
		this.ctx.lineWidth = 1;
	}

	this.updateCells();
	this.Draw();
}

window.addEventListener("mousemove", function(s) {
	if (!window.editor || !editor.ctx) return;

	if (editor.isPanning) {
		editor.div.scrollLeft = editor.panStartScrollX - (s.clientX - editor.panStartX);
		editor.div.scrollTop = editor.panStartScrollY - (s.clientY - editor.panStartY);
		return;
	}

	// The canvas is CSS-scaled, so divide by the zoom to land on bitmap pixels.
	var canvasRect = editor.canvas.getBoundingClientRect();
	editor.mouseX = Math.floor((s.clientX - canvasRect.left) / editor.zoom);
	editor.mouseY = Math.floor((s.clientY - canvasRect.top) / editor.zoom);

	if (editor.mouseLeft) {
		if (editor.toolType === 'pencil') {
			if (selection && selection.selected != null) editor.placeBlock();
		} else if (editor.toolType === 'eraser') {
			editor.removeBlock();
		}
	} else if (editor.mouseRight) {
		editor.removeBlock();
	}

	if (selection && selection.canvas) {
		var rect = selection.canvas.getBoundingClientRect();
		var scale = rect.width / selection.canvas.width || 1;
		selection.mouseX = Math.floor((s.clientX - rect.left) / scale);
		selection.mouseY = Math.floor((s.clientY - rect.top) / scale);
		if (selection.dragStart) selection.dragTo();
	}
}, false);

window.addEventListener("mouseup", function(e) {
	if (!window.editor) return;
	if (editor.isPanning) editor.endPan();
	if (e.button === 0) editor.mouseLeft = false;
	if (e.button === 0 && selection) selection.dragStart = null;
	if (e.button === 2) editor.mouseRight = false;
	editor.strokeOpen = false;
}, false);

// Platform integration: the saved project is the level text plus the tileset URL.
window.serializeProjectData = function() {
	if (editor) editor.Export();
	return JSON.stringify({
		mapData: $('output').value,
		tilesetUrl: $('tilemap').value
	});
};

window.loadProjectData = function(jsonStr) {
	var data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
	if (!data) return;
	var applyMap = function(){
		if (data.mapData) {
			$('output').value = data.mapData;
			if (window.editor) editor.LoadMap();
		}
		if (window.editor) editor.Draw();
		if (window.onProjectLoaded) window.onProjectLoaded();
	};
	if (data.tilesetUrl && window.editor) {
		$('tilemap').value = data.tilesetUrl;
		editor.loadTilesetImage(data.tilesetUrl, applyMap);
	} else {
		applyMap();
	}
};
