/*****************************************************************
** Author: Asvin Goel, goel@telematique.eu
**
** A plugin for deck.js adding a chalkboard.
**
** Version: 0.9.1
**
** License: MIT license (see LICENSE.md)
**
** Credits:
** Multi color support by Kurt Rinnert https://github.com/rinnert
******************************************************************/

var RevealHandWrite = window.RevealHandWrite || { id: 'handwrite', init: (reveal) => {
    let deck = reveal;

    var path = scriptPath();
	function scriptPath() {
		// obtain plugin path from the script element
		var src;
		if (document.currentScript) {
			src = document.currentScript.src;
		} else {
			var sel = document.querySelector('script[src$="/handwrite.js"]')
			if (sel) {
				src = sel.src;
			}
		}

		var path = typeof src === undefined ? src
			: src.slice(0, src.lastIndexOf("/") + 1);
        //console.log("Path: " + path);
		return path;
    }


    /* Feature detection for passive event handling*/
    var passiveSupported = false;

    try {
    window.addEventListener("test", null, Object.defineProperty({}, "passive", { get: function() { passiveSupported = true; } }));
    } catch(err) {}


    /*****************************************************************
    ** Configuration
    ******************************************************************/
	var color = 0;
	var penWidth = 3;
	var eraser = { src: path + 'img/sponge.png', radius: 20};
	var pens = [
		{ color: 'rgba(100,100,100,1)', cursor: 'url(' + path + 'img/boardmarker-black.png), auto'},
		{ color: 'rgba(30,144,255, 1)', cursor: 'url(' + path + 'img/boardmarker-blue.png), auto'},
		{ color: 'rgba(220,20,60,1)', cursor: 'url(' + path + 'img/boardmarker-red.png), auto'},
		{ color: 'rgba(50,205,50,1)', cursor: 'url(' + path + 'img/boardmarker-green.png), auto'},
		{ color: 'rgba(255,140,0,1)', cursor: 'url(' + path + 'img/boardmarker-orange.png), auto'},
		{ color: 'rgba(150,0,20150,1)', cursor: 'url(' + path + 'img/boardmarker-purple.png), auto'},
		{ color: 'rgba(255,220,0,1)', cursor: 'url(' + path + 'img/boardmarker-yellow.png), auto'}
	];
	var toggleNotesButton = true;    
	var readOnly = undefined;

	function configure( config ) {
		if ( config.penWidth ) penWidth = config.penWidth;
		if ( config.eraser ) eraser = config.eraser;
		if ( config.pens) pens = config.pens;

		if (config.toggleNotesButton != undefined)  toggleNotesButton = config.toggleNotesButton;

		if (config.readOnly) readOnly = config.readOnly;

		return config;
	}
    /*****************************************************************
    ** Setup
    ******************************************************************/

	function whenReady( callback ) {
		// wait for drawings to be loaded and markdown to be parsed
		if ( loaded == null || document.querySelector('section[data-markdown]:not([data-markdown-parsed])') ) {
			setTimeout( whenReady, 500, callback )
		}
		else {
			callback();
		}
	}

    var config = configure( deck.getConfig().chalkboard || {} );

	if ( toggleNotesButton ) {
        //console.log("toggleNotesButton")
		var button = document.createElement( 'div' );
		button.className = "chalkboard-button";
		button.id = "toggle-notes";
		button.style.position = "absolute";
		button.style.zIndex = 30;
		button.style.fontSize = "24px";

		button.style.left = toggleNotesButton.left || "30px";
		button.style.bottom = toggleNotesButton.bottom ||  "30px";
		button.style.top = toggleNotesButton.top ||  "auto";
		button.style.right = toggleNotesButton.right ||  "auto";
		button.style.opacity = "0.3";

		button.innerHTML = '<a href="#" onclick="RevealHandWrite.toggleNotesCanvas(); return false;"><i class="fa fa-pen"></i></a>'
		document.querySelector(".reveal").appendChild( button );
	}
    //alert("Buttons");

    var eraseMode = false;
    var eraserButton = null;
    function setEraseMode() {
        eraseMode = true;
        eraserButton.style.opacity = 1;
        drawingCanvas.canvas.style.cursor = `url("${eraser.src}") ${eraser.radius} ${eraser.radius}, auto`;
    }
    function unsetEraseMode() {
        eraseMode = false;
        eraserButton.style.opacity = 0.3;
		drawingCanvas.canvas.style.cursor = pens[color].cursor;
    }

    function toggleEraseMode() {
        if (eraseMode) {
            unsetEraseMode();
        } else {
            setEraseMode();
        }
    }

    {
        //console.log("toggleNotesButton")
		let button = document.createElement( 'div' );
		button.id = "toggle-eraser";
		button.style.position = "absolute";
		button.style.zIndex = 30;
		button.style.fontSize = "24px";

		button.style.left = "70px";
		button.style.bottom = "30px";
		button.style.top = "auto";
		button.style.right = "auto";
        button.style.visibility = 'hidden';

		button.innerHTML = '<a href="#" onclick="RevealHandWrite.toggleEraseMode(); return false;"><i class="fa fa-eraser"></i></a>'
        document.querySelector(".reveal").appendChild( button );
        eraserButton = button;
	}

	var drawingCanvas = {id: "notescanvas" };
	setupDrawingCanvas(0);

	var mouseX = 0;
	var mouseY = 0;
	var xLast = null;
	var yLast = null;

	var slideStart = Date.now();
	var slideIndices =  { h:0, v:0 };
    var event = null;
    var timeouts = [];

	function setupDrawingCanvas( id ) {
		var container = document.createElement( 'div' );
		container.id = drawingCanvas.id;
		container.classList.add( 'overlay' );
		container.setAttribute( 'data-prevent-swipe', '' );
		container.oncontextmenu = function() { return false; }
		container.style.cursor = pens[ color ].cursor;
        container.style.background = "rgba(0,0,0,0)";

		drawingCanvas.width = window.innerWidth;
		drawingCanvas.height = window.innerHeight;
		drawingCanvas.scale = 1;
		drawingCanvas.xOffset = 0;
		drawingCanvas.yOffset = 0;


        container.style.zIndex = "24";
        container.style.visibility = 'visible';
        container.style.pointerEvents = "none";

        var aspectRatio = deck.getConfig().width / deck.getConfig().height;
        if ( drawingCanvas.width > drawingCanvas.height*aspectRatio ) {
            drawingCanvas.xOffset = (drawingCanvas.width - drawingCanvas.height*aspectRatio) / 2;
        }
        else if ( drawingCanvas.height > drawingCanvas.width/aspectRatio ) {
            drawingCanvas.yOffset = ( drawingCanvas.height - drawingCanvas.width/aspectRatio ) / 2;
        }

		var sponge = document.createElement( 'img' );
		sponge.src = eraser.src;
		sponge.id = "sponge";
		sponge.style.visibility = "hidden";
		sponge.style.position = "absolute";
		container.appendChild( sponge );
		drawingCanvas.sponge = sponge;

		var canvas = document.createElement( 'canvas' );
		canvas.width = drawingCanvas.width;
		canvas.height = drawingCanvas.height;
		canvas.setAttribute( 'data-chalkboard', "" );
		canvas.style.cursor = pens[ color ].cursor;
		container.appendChild( canvas );
		drawingCanvas.canvas = canvas;

		drawingCanvas.context = canvas.getContext("2d");


		document.querySelector( '.reveal' ).appendChild( container );
		drawingCanvas.container = container;
	}


    /*****************************************************************
    ** Storage
    ******************************************************************/

	var storage = { width: deck.getConfig().width, height: deck.getConfig().height, data: []};

    //console.log( JSON.stringify(storage));

	var loaded = null;
	if ( config.src != null ) {
		loadData( config.src );
	}


	/**
	 * Load data.
	 */
	function loadData( filename ) {
		var xhr = new XMLHttpRequest();
		xhr.onload = function() {
			if (xhr.readyState === 4 && xhr.status != 404 ) {
				storage = JSON.parse(xhr.responseText);
                if ( drawingCanvas.width != storage.width || drawingCanvas.height != storage.height ) {
                    drawingCanvas.scale = Math.min( drawingCanvas.width/storage.width, drawingCanvas.height/storage.height);
                    drawingCanvas.xOffset = (drawingCanvas.width - storage.width * drawingCanvas.scale)/2;
                    drawingCanvas.yOffset = (drawingCanvas.height - storage.height * drawingCanvas.scale)/2;
                }
                if ( config.readOnly ) {
                    drawingCanvas.container.style.cursor = 'default';
                    drawingCanvas.canvas.style.cursor = 'default';
                }
				loaded = true;
//console.log("Drawings loaded");
			}
			else {
				config.readOnly = undefined;
				readOnly = undefined;
				console.warn( 'Failed to get file ' + filename +". ReadyState: " + xhr.readyState + ", Status: " + xhr.status);
				loaded = false;
			}
		};

		xhr.open( 'GET', filename, true );
		try {
			xhr.send();
		}
		catch ( error ) {
			config.readOnly = undefined;
			readOnly = undefined;
			console.warn( 'Failed to get file ' + filename + '. Make sure that the presentation and the file are served by a HTTP server and the file can be found there. ' + error );
			loaded = false;
		}
	}

	/**
	 * Download data.
	 */
	function downloadData() {
		var a = document.createElement('a');
		document.body.appendChild(a);
		try {
			// cleanup slide data without events
            for (var i = storage.data.length-1; i >= 0; i--) {
                if (storage.data[i].events.length == 0) {
                    storage.data.splice(i, 1);
                }
            }
			a.download = "chalkboard.json";
			var blob = new Blob( [ JSON.stringify( storage ) ], { type: "application/json"} );
			a.href = window.URL.createObjectURL( blob );
		} catch( error ) {
			a.innerHTML += " (" + error + ")";
		}
		a.click();
		document.body.removeChild(a);
	}

	/**
	 * Returns data object for the slide with the given indices.
	 */
	function getSlideData( indices) {
		if (!indices) indices = slideIndices;
		var data;
		for (var i = 0; i < storage.data.length; i++) {
			if (storage.data[i].slide.h === indices.h && storage.data[i].slide.v === indices.v && storage.data[i].slide.f === indices.f ) {
				data = storage.data[i];
				return data;
			}
		}
		storage.data.push( { slide: indices, events: [], duration: 0 } );
		data = storage.data[storage.data.length-1];
		return data;
	}

	/**
	 * Returns maximum duration of slide playback for both modes
	 */
	function getSlideDuration( indices ) {
		if (!indices) indices = slideIndices;
		var duration = 0;
        for (var i = 0; i < storage.data.length; i++) {
            if (storage.data[i].slide.h === indices.h && storage.data[i].slide.v === indices.v && storage.data[i].slide.f === indices.f ) {
                duration = Math.max( duration, storage.data[i].duration );
                break;
            }
        }
		return duration;
	}

/*****************************************************************
** Print
******************************************************************/
	var printMode = ( /print-pdf/gi ).test( window.location.search );

	function createPrintout( ) {
		drawingCanvas.container.style.opacity = 0; // do not print notes canvas
		drawingCanvas.container.style.visibility = 'hidden';
		var nextSlide = [];
		for (var i = 0; i < storage.data.length; i++) {
			var slide = deck.getSlide( storage.data[i].slide.h, storage.data[i].slide.v );
			nextSlide.push( slide.nextSibling );
		}
	}

	function addPrintout( parent, nextSlide, imgCanvas, patImg ) {
		var slideCanvas = document.createElement('canvas');
		slideCanvas.width = deck.getConfig().width;
		slideCanvas.height = deck.getConfig().height;
		var ctx = slideCanvas.getContext("2d");
		ctx.fillStyle = ctx.createPattern( patImg ,'repeat');
		ctx.rect(0,0,slideCanvas.width,slideCanvas.height);
		ctx.fill();
		ctx.drawImage(imgCanvas, 0, 0);

		var newSlide = document.createElement( 'section' );
		newSlide.classList.add( 'present' );
		newSlide.innerHTML = '<h1 style="visibility:hidden">Drawing</h1>';
		newSlide.setAttribute("data-background-size", '100% 100%' );
		newSlide.setAttribute("data-background-repeat", 'norepeat' );
		newSlide.setAttribute("data-background", 'url("' + slideCanvas.toDataURL("image/png") +'")' );
		if ( nextSlide != null ) {
			parent.insertBefore( newSlide, nextSlide );
		}
		else {
			parent.append( newSlide );
		}
	}

/*****************************************************************
** Drawings
******************************************************************/

    function drawWithPen(context,fromX,fromY,toX,toY){
        context.lineWidth = penWidth;
        context.lineCap = 'butt';
        context.strokeStyle = pens[color].color;
        context.beginPath();
        context.moveTo(fromX, fromY);
        context.lineTo(toX, toY);
        context.stroke();
    }

	function eraseWithSponge(context,x,y) {
		context.save();
		context.beginPath();
		context.arc(x, y, eraser.radius, 0, 2 * Math.PI, false);
		context.clip();
		context.clearRect(x - eraser.radius - 1, y - eraser.radius - 1, eraser.radius * 2 + 2, eraser.radius * 2 + 2);
		context.restore();
	}


	/**
	 * Clear current canvas.
	 */
	function clearCanvas() {
		drawingCanvas.context.clearRect(0,0,drawingCanvas.width,drawingCanvas.height);
	}

    /**
	 * Set the  color
	 */
	function setColor( index ) {
		// protect against out of bounds (this could happen when
		// replaying events recorded with different color settings).
		if ( index >= pens.length ) index = 0;
		color = index;
		drawingCanvas.canvas.style.cursor = pens[color].cursor;
	}

	/**
	 * Forward cycle color
	 */
	function cycleColorNext() {
		color = (color + 1) % pens.length;
		return color;
	}

	/**
	 * Backward cycle color
	 */
	function cycleColorPrev() {
		color = (color + (pens.length - 1)) % pens.length;
		return color;
	}

/*****************************************************************
** Broadcast
******************************************************************/
	document.addEventListener( 'received', function ( message ) {
//console.log(JSON.stringify(message));
		if ( message.content && message.content.sender == 'chalkboard-plugin' ) {
			switch ( message.content.type ) {
				case 'startDrawing':
					startDrawing(message.content.x, message.content.y, message.content.erase);
					break;
				case 'startErasing':
					if ( message.content ) {
						message.content.type = "erase";
						message.content.begin = Date.now() - slideStart;
						eraseWithSponge(drawingCanvas.context, message.content.x, message.content.y);
					}
					break;
				case 'drawSegment':
					drawSegment(message.content.x, message.content.y, message.content.erase);
					break;
				case 'stopDrawing':
					stopDrawing();
					break;
				case 'clear':
                    if ( !readOnly ) {
                        recordEvent( { type:"clear", begin: Date.now() - slideStart } );
                        clearCanvas();
                    }
					break;
				case 'setcolor':
					setColor(message.content.index);
					break;
				case 'resetSlide':
					resetSlide(true);
					break;
				case 'init':
					storage = message.content.storage;
                    drawingCanvas.scale = Math.min( drawingCanvas.width/storage.width, drawingCanvas.height/storage.height );
                    drawingCanvas.xOffset = (drawingCanvas.width - storage.width * drawingCanvas.scale)/2;
                    drawingCanvas.yOffset = (drawingCanvas.height - storage.height * drawingCanvas.scale)/2;
					clearCanvas();
						startPlayback( getSlideDuration(), 0 );
					break;
				default:
					break;
			}
		}
	});

/*****************************************************************
** Playback
******************************************************************/


	function recordEvent( event ) {
		var slideData = getSlideData();
		var i = slideData.events.length;
		while ( i > 0 && event.begin < slideData.events[i-1].begin ) {
			i--;
		}
		slideData.events.splice( i, 0, event);
		slideData.duration = Math.max( slideData.duration, Date.now() - slideStart ) + 1;
	}

	function startPlayback( timestamp ) {
		slideStart = Date.now() - timestamp;
        clearCanvas();
        var slideData = getSlideData( slideIndices);
//console.log( timestamp +" / " + JSON.stringify(slideData));
        var index = 0;
        for ( let index = 0; index < slideData.events.length ; index++ ) {
            playEvent( slideData.events[index] );
        }
	}

	function stopPlayback() {
        for (var i = 0; i < timeouts.length; i++) {
            clearTimeout(timeouts[id][i]);
        }
        timeouts = [];
	}

	function playEvent( event ) {
		switch ( event.type ) {
			case "clear":
				clearCanvas();
				break;
			case "setcolor":
				setColor(event.index);
				break;
			case "draw":
				drawCurve( event );
				break;
			case "erase":
				eraseCurve( event );
				break;

		}
	}

	function drawCurve( event ) {
		if  ( event.curve.length > 1 ) {
			var ctx = drawingCanvas.context;
			var scale = drawingCanvas.scale;
			var xOffset = drawingCanvas.xOffset;
			var yOffset = drawingCanvas.yOffset;

			var stepDuration = ( event.end - event.begin )/ ( event.curve.length - 1 );
//console.log("---");
			for (var i = 1; i < event.curve.length; i++) {
				if (event.begin + i * stepDuration <= (Date.now() - slideStart)) {
//console.log( "Draw " + timestamp +" / " + event.begin + " + " + i + " * " + stepDuration );
					drawWithPen(ctx, xOffset + event.curve[i-1].x*scale, yOffset + event.curve[i-1].y*scale, xOffset + event.curve[i].x*scale, yOffset + event.curve[i].y*scale);
				}
			}
		}

	}

	function eraseCurve( event ) {
		if  ( event.curve.length > 1 ) {
			var ctx = drawingCanvas.context;
			var scale = drawingCanvas.scale;
			var xOffset = drawingCanvas.xOffset;
			var yOffset = drawingCanvas.yOffset;

			var stepDuration = ( event.end - event.begin )/ event.curve.length;
			for (var i = 0; i < event.curve.length; i++) {
				if (event.begin + i * stepDuration <= (Date.now() - slideStart)) {
					eraseWithSponge(ctx, xOffset + event.curve[i].x*scale, yOffset + event.curve[i].y*scale);
				}
			}
		}

	}


	function startDrawing( x, y, erase ) {
			var ctx = drawingCanvas.context;
			var scale = drawingCanvas.scale;
			var xOffset = drawingCanvas.xOffset;
			var yOffset = drawingCanvas.yOffset;
			xLast = x * scale + xOffset;
			yLast = y * scale + yOffset;
			if ( erase === true) {
				event = { type: "erase", begin: Date.now() - slideStart, end: null, curve: [{x: x, y: y}]};
				drawingCanvas.canvas.style.cursor = 'url("' + eraser.src +  '") ' + eraser.radius + ' ' + eraser.radius + ', auto';
				eraseWithSponge(ctx, x * scale + xOffset, y * scale + yOffset);
			}
			else {
				event = { type: "draw", begin: Date.now() - slideStart, end: null, curve: [{x: x, y: y}] };
			}
	}

	function drawSegment( x, y, erase ) {
		var ctx = drawingCanvas.context;
		var scale = drawingCanvas.scale;
		var xOffset = drawingCanvas.xOffset;
		var yOffset = drawingCanvas.yOffset;
		if ( !event ) {
			// safeguard if broadcast hickup
			startDrawing( x, y, erase );
		}
		event.curve.push({x: x, y: y});
		if(y * scale + yOffset < drawingCanvas.height && x * scale + xOffset < drawingCanvas.width) {
			if ( erase ) {
				eraseWithSponge(ctx, x * scale + xOffset, y * scale + yOffset);
			}
			else {
				drawWithPen(ctx, xLast, yLast, x * scale + xOffset, y * scale + yOffset);
			}
			xLast = x * scale + xOffset;
			yLast = y * scale + yOffset;
		}
	}

	function stopDrawing() {
		if ( event ) {
			event.end = Date.now() - slideStart;
			if ( event.type == "erase" || event.curve.length > 1 ) {
				// do not save a line with a single point only
				recordEvent( event );
			}
			event = null;
		}
	}


/*****************************************************************
** User interface
******************************************************************/


// TODO: check all touchevents
	document.addEventListener('touchstart', function(evt) {
		if ( !readOnly && evt.target.hasAttribute('data-chalkboard') ) {
			var scale = drawingCanvas.scale;
			var xOffset = drawingCanvas.xOffset;
			var yOffset = drawingCanvas.yOffset;

			evt.preventDefault();
		        var touch = evt.touches[0];
		        mouseX = touch.pageX;
		        mouseY = touch.pageY;
			startDrawing( (mouseX - xOffset)/scale, (mouseY-yOffset)/scale, eraseMode );
			// broadcast
			var message = new CustomEvent('send');
			message.content = { sender: 'chalkboard-plugin', type: 'startDrawing', x: (mouseX - xOffset)/scale, y: (mouseY-yOffset)/scale, erase: eraseMode };
			document.dispatchEvent( message );
		}
	}, passiveSupported ? {passive: false} : false);

	document.addEventListener('touchmove', function(evt) {
//console.log("Touch move");
		if ( event ) {
			var scale = drawingCanvas.scale;
			var xOffset = drawingCanvas.xOffset;
			var yOffset = drawingCanvas.yOffset;

		        var touch = evt.touches[0];
        		mouseX = touch.pageX;
        		mouseY = touch.pageY;
        		if (mouseY < drawingCanvas.height && mouseX < drawingCanvas.width) {
        		    	evt.preventDefault();
				// move sponge
				if ( event.type == "erase" ) {
					drawingCanvas.sponge.style.left = (mouseX - eraser.radius) +"px" ;
					drawingCanvas.sponge.style.top = (mouseY - eraser.radius) +"px" ;
				}
			}

			drawSegment( (mouseX - xOffset)/scale, (mouseY-yOffset)/scale, eraseMode );
			// broadcast
			var message = new CustomEvent('send');
			message.content = { sender: 'chalkboard-plugin', type: 'drawSegment', x: (mouseX - xOffset)/scale, y: (mouseY-yOffset)/scale, erase: eraseMode };
			document.dispatchEvent( message );
		}
	}, false);


	document.addEventListener('touchend', function(evt) {
		// hide sponge image
		drawingCanvas.sponge.style.visibility = "hidden";
		stopDrawing();
		// broadcast
		var message = new CustomEvent('send');
		message.content = { sender: 'chalkboard-plugin', type: 'stopDrawing' };
		document.dispatchEvent( message );
	}, false);

	document.addEventListener( 'mousedown', function( evt ) {
		if ( !readOnly && evt.target.hasAttribute('data-chalkboard') ) {
			var scale = drawingCanvas.scale;
			var xOffset = drawingCanvas.xOffset;
			var yOffset = drawingCanvas.yOffset;

			mouseX = evt.pageX;
			mouseY = evt.pageY;
			startDrawing( (mouseX - xOffset)/scale, (mouseY-yOffset)/scale, eraseMode );
			// broadcast
			var message = new CustomEvent('send');
			message.content = { sender: 'chalkboard-plugin', type: 'startDrawing', x: (mouseX - xOffset)/scale, y: (mouseY-yOffset)/scale, erase: eraseMode };
			document.dispatchEvent( message );
		}
	} );

	document.addEventListener( 'mousemove', function( evt ) {
//console.log("Mouse move");
		if ( event ) {
			var scale = drawingCanvas.scale;
			var xOffset = drawingCanvas.xOffset;
			var yOffset = drawingCanvas.yOffset;

			mouseX = evt.pageX;
			mouseY = evt.pageY;
			drawSegment( (mouseX - xOffset)/scale, (mouseY-yOffset)/scale, eraseMode );
			// broadcast
			var message = new CustomEvent('send');
			message.content = { sender: 'chalkboard-plugin', type: 'drawSegment', x: (mouseX - xOffset)/scale, y: (mouseY-yOffset)/scale, erase: eraseMode };
			document.dispatchEvent( message );
		}
	} );


	document.addEventListener( 'mouseup', function( evt ) {
		if ( event ) {
			stopDrawing();
			// broadcast
			var message = new CustomEvent('send');
			message.content = { sender: 'chalkboard-plugin', type: 'stopDrawing' };
			document.dispatchEvent( message );
		}
	} );


	window.addEventListener( "resize", function() {
//console.log("resize");
		// Resize the canvas and draw everything again
		var timestamp = getSlideDuration();

        drawingCanvas.width  = window.innerWidth;
        drawingCanvas.height = window.innerHeight;
        drawingCanvas.canvas.width  = drawingCanvas.width;
        drawingCanvas.canvas.height = drawingCanvas.height;
        drawingCanvas.context.canvas.width  = drawingCanvas.width;
        drawingCanvas.context.canvas.height = drawingCanvas.height;

        drawingCanvas.scale = Math.min( drawingCanvas.width/storage.width, drawingCanvas.height/storage.height );
        drawingCanvas.xOffset = (drawingCanvas.width - storage.width * drawingCanvas.scale)/2;
        drawingCanvas.yOffset = (drawingCanvas.height - storage.height * drawingCanvas.scale)/2;

        startPlayback( timestamp );

	} );

	deck.addEventListener( 'ready', function( evt ) {
//console.log('ready');
		if ( !printMode ) {
			slideStart = Date.now();
			slideIndices = deck.getIndices();
            startPlayback( getSlideDuration() );
		}
		else {
			whenReady( createPrintout );
		}
	});
	deck.addEventListener( 'slidechanged', function( evt ) {
		if ( !printMode ) {
			slideStart = Date.now();
			slideIndices = deck.getIndices();
			clearCanvas();
            startPlayback( getSlideDuration() );
		}
	});
	deck.addEventListener( 'fragmentshown', function( evt ) {
		if ( !printMode ) {
			slideStart = Date.now();
			slideIndices = deck.getIndices();
			clearCanvas();
            startPlayback( getSlideDuration(), 0 );
		}
	});
	deck.addEventListener( 'fragmenthidden', function( evt ) {
		if ( !printMode ) {
			slideStart = Date.now();
			slideIndices = deck.getIndices();
			clearCanvas();
            startPlayback( getSlideDuration() );
		}
	});

    function closeNotesCanvas() {
        unsetEraseMode();
        if ( notescanvas.style.pointerEvents !== "none" ) {
            let button = document.getElementById("toggle-notes");
            event = null;
            notescanvas.style.pointerEvents = "none";
            button.style.opacity = "0.3";
        }
        eraserButton.style.visibility = 'hidden';
    }

    function openNotesCanvas() {
        unsetEraseMode();
        setColor(0);
        let button = document.getElementById("toggle-notes");
        button.style.opacity = "1";
        recordEvent( { type:"setcolor", index: 0, begin: Date.now() - slideStart } );
        if (color) {
            let idx = color;
            setColor(idx);
            recordEvent( { type:"setcolor", index: idx, begin: Date.now() - slideStart } );
        } else {
            color = 0;
        }
        notescanvas.style.pointerEvents = "auto";
        eraserButton.style.visibility = 'visible';
        eraserButton.style.opacity = 0.3;
    }

	function toggleNotesCanvas() {
        if ( !readOnly ) {
            if ( notescanvas.style.pointerEvents != "none" ) {
                closeNotesCanvas();
            }
            else {
                openNotesCanvas();
            }
		}
	}

	function clear() {
		if ( !readOnly ) {
			recordEvent( { type:"clear", begin: Date.now() - slideStart } );
			clearCanvas();
			// broadcast
			var message = new CustomEvent('send');
			message.content = { sender: 'chalkboard-plugin', type: 'clear' };
			document.dispatchEvent( message );
		}
	}

	function colorNext() {
		if ( !readOnly ) {
			let idx = cycleColorNext();
			setColor(idx);
			recordEvent( { type: "setcolor", index: idx, begin: Date.now() - slideStart } );
		}
	}

	function colorPrev() {
		if ( !readOnly ) {
			let idx = cycleColorPrev();
			setColor(idx);
			recordEvent( { type: "setcolor", index: idx, begin: Date.now() - slideStart } );
			// broadcast
			// var message = new CustomEvent('send');
			// message.content = { sender: 'chalkboard-plugin', type: 'setcolor', index: idx };
			// document.dispatchEvent( message );
		}
	}

    function resetSlideWithPost( force ) {
        resetSlide(force);
        // broadcast
        var message = new CustomEvent('send');
        message.content = { sender: 'chalkboard-plugin', type: 'resetSlide' };
        document.dispatchEvent( message );
    }

	function resetSlide( force ) {
		var ok = force || confirm("Please confirm to delete chalkboard drawings on this slide!");
		if ( ok ) {
//console.log("resetSlide ");
			stopPlayback();
			slideStart = Date.now();
			event = null;

			clearCanvas();

			var slideData = getSlideData();
			slideData.duration = 0;
			slideData.events = [];
		}
	}

	function resetStorage( force ) {
		var ok = force || confirm("Please confirm to delete all chalkboard drawings!");
		if ( ok ) {
			stopPlayback();
			slideStart = Date.now();
			clearCanvas();
			storage = { width: drawingCanvas.width - 2 * drawingCanvas.xOffset, height: drawingCanvas.height - 2 * drawingCanvas.yOffset, data: []};

			// broadcast
			var message = new CustomEvent('send');
			message.content = { sender: 'chalkboard-plugin', type: 'init', storage: storage };
			document.dispatchEvent( message );
		}
	}

    
	RevealHandWrite.toggleNotesCanvas = toggleNotesCanvas;
	RevealHandWrite.toggleEraseMode = toggleEraseMode;
	RevealHandWrite.clear = clear;
	RevealHandWrite.colorNext = colorNext;
	RevealHandWrite.colorPrev = colorPrev;
	RevealHandWrite.reset = resetSlideWithPost;
	RevealHandWrite.resetAll = resetStorage;
	RevealHandWrite.download = downloadData;
	RevealHandWrite.configure = configure;
}};
