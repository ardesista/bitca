const ARRAY_COLUMN_MAJOR   = 0x1;
const ARRAY_RIGHT_TO_LEFT  = 0x2;

var cursor = [ -1, -1 ];
var selectedTool = { draw: "pencil" };
var drawing = false;
var canvas, previewCanvas;
var bitmap = [ 0, 0, 0, 0, 0, 0, 0, 0 ];
var arrayOrder = 0;
var hist = [];
var hist_cur = -1;

function loadSettings() {
    var settings = {};
    var kws = document.cookie.split(";");
    for(var i = 0; i < kws.length; ++i) {
        var kw = kws[i].trim().split("=");
        if(kw.length == 2 && kw[0].trim() == "settings") {
            settings = JSON.parse(kw[1]);
            break;
        }
    }

    switch(settings.order || 0) {
        case 0:
            click.call(document.getElementById("order-row-left"));
            break;
        case ARRAY_COLUMN_MAJOR:
            click.call(document.getElementById("order-col-left"));
            break;
        case ARRAY_RIGHT_TO_LEFT:
            click.call(document.getElementById("order-row-right"));
            break;
        case ARRAY_COLUMN_MAJOR | ARRAY_RIGHT_TO_LEFT:
            click.call(document.getElementById("order-col-right"));
            break;
    }
}

function saveSettings() {
    var settings = {
        order: arrayOrder
    };
    const expires = new Date();
    expires.setTime(expires.getTime() + 31557600000);
    document.cookie = "settings=" + JSON.stringify(settings) + ";expires=" + expires.toUTCString() + ";path=/";
}

function setArrayOrder(x) {
    x &= 0x3;
    if(x != arrayOrder) {
        arrayOrder = x;
        redrawBitmap();
    }
    saveSettings();
}

function parseHexcode() {
    try {
        var a = eval(this.value.replace("{", "[").replace("}", "]"));
        if(!Array.isArray(a) || a.length != 8) {
            console.log("Unable to parse hexcode!");
            return;
        }

        var col_major = Boolean(arrayOrder & ARRAY_COLUMN_MAJOR);
        var right_to_left = Boolean(arrayOrder & ARRAY_RIGHT_TO_LEFT);    
        for(var i = 0; i < 8; ++i) {
            bitmap[i] = 0;
            for(var j = 0; j < 8; ++j) {
                var k = col_major ? i : j;
                if((a[col_major ? j : i] >> (right_to_left ? k : (7 - k))) & 0x1)
                    bitmap[i] |= (0x1 << j);
            }
        }

        redrawBitmap();
    }
    catch(e) {
        // Pass
    }
}

function renderHexcode() {
    var a = [ 0, 0, 0, 0, 0, 0, 0, 0 ];
    var col_major = Boolean(arrayOrder & ARRAY_COLUMN_MAJOR);
    var right_to_left = Boolean(arrayOrder & ARRAY_RIGHT_TO_LEFT);
    for(var i = 0; i < 8; ++i) {
        var line = bitmap[i];
        for(var j = 0; j < 8; ++j) {
            if((line >> j) & 0x1) {
                var k = (col_major ? i : j);
                a[col_major ? j : i] |= (right_to_left ? (0x1 << k) : (0x80 >> k));
            }
        }
    }
    return "{ " + a.map((x) => "0x" + x.toString(16).padStart(2, "0")).join(", ") + " }";
}

function click() {
    switch(this.id) {
        case "pencil":
            selectTool.call(this, "draw");
            break;
        case "eraser":
            selectTool.call(this, "draw");
            break;
        case "download":
            var dataURL = canvas.toDataURL('image/png');
            dataURL = dataURL.replace(/^data:image\/[^;]*/, 'data:application/octet-stream');
            dataURL = dataURL.replace(/^data:application\/octet-stream/, 'data:application/octet-stream;headers=Content-Disposition%3A%20attachment%3B%20filename=bitmap.png');
            this.href = dataURL;    
            break;
        case "undo":
            if(hist_cur >= 0) {
                _setBit(hist[hist_cur][0], hist[hist_cur][1], !hist[hist_cur][2], true);
                --hist_cur;
            }
            break;
        case "redo":
            if(hist.length > hist_cur + 1) {
                ++hist_cur;
                _setBit(hist[hist_cur][0], hist[hist_cur][1], hist[hist_cur][2], true);
            }
            break;
        case "order-row-left":
            selectTool.call(this, "order");
            setArrayOrder(0);
            break;
        case "order-row-right":
            selectTool.call(this, "order");
            setArrayOrder(ARRAY_RIGHT_TO_LEFT);
            break;
        case "order-col-left":
            selectTool.call(this, "order");
            setArrayOrder(ARRAY_COLUMN_MAJOR);
            break;
        case "order-col-right":
            selectTool.call(this, "order");
            setArrayOrder(ARRAY_COLUMN_MAJOR | ARRAY_RIGHT_TO_LEFT);
            break;                                
        case "clipboard":
            //document.getElementById("clipboard-alert").classList.add("show");
            navigator.clipboard.writeText(renderHexcode())
                .then(() => {
                    document.querySelector(".clipboard-popup").classList.add("popup-anim");
                })
                .catch(() => {
                    console.log("Copy to clipboard FAILED!");
                });
            break;
    }
}

function selectTool(group) {
    document.querySelectorAll(".button[data-group='" + group + "']").forEach((other) => {
        other.classList.remove("button-selected");
    });
    this.classList.add("button-selected");
    selectedTool[group] = this.id;
}

function _setBit(row, col, val, no_hist) {
    var cursorMoved;
    if(no_hist) {
        cursorMoved = (cursor[0] != -1 || cursor[1] != -1);
        cursor[0] = cursor[0] = -1;
    }
    else {
        cursorMoved = (cursor[0] != row || cursor[1] != col);
        cursor[0] = row;
        cursor[1] = col;
    }

    var dirty = false;
    var m = 0x1 << col;
    if(val) {
        if(!(bitmap[row] & m))
            dirty = true;
        bitmap[row] |= m;
    }
    else {
        if(!(~bitmap[row] & m))
            dirty = true;
        bitmap[row] &= 0xff & ~m;
    }

    if(dirty && !no_hist) {
        ++hist_cur;
        if(hist.length > hist_cur)
            hist = hist.slice(0, hist_cur);
        hist.push([ row, col, val ]);    
    }

    if(dirty || cursorMoved)
        redrawBitmap();
}

function _setCursor(row, col) {
    if(cursor[0] == row && cursor[1] == col)
        return;

    cursor[0] = row;
    cursor[1] = col;
    redrawBitmap();
}

function redrawBitmap() {
    var ctx = canvas.getContext("2d");
    ctx.strokeStyle = null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = "#c0c0c0";
    ctx.lineWidth = 1;
    for(var k = 1; k < 8; ++k) {
        ctx.beginPath();
        ctx.moveTo(k * 48, 0);
        ctx.lineTo(k * 48, 383);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, k * 48);
        ctx.lineTo(383, k * 48);
        ctx.stroke();
    }

    // Draw actual bitmap
    ctx.strokeStyle = null;
    ctx.fillStyle = "#000000";
    for(var i = 0; i < 8; ++i) {
        var line = bitmap[i];
        for(var j = 0; j < 8; ++j) {
            if((line >> j) & 0x1)
                ctx.fillRect(j * 48, i * 48, 48, 48);
        }
    }

    // Draw cursor
    ctx.strokeStyle = null;
    ctx.fillStyle = (selectedTool.draw == "pencil" ? "#153400" : "#f0f0f0");
    ctx.fillRect(cursor[1] * 48, cursor[0] * 48, 48, 48);

    // Render hex code
    if(document.activeElement != document.querySelector("#hexcode-text > input"))
        document.querySelector("#hexcode-text > input").value = renderHexcode();
    
    // Draw preview
    ctx = previewCanvas.getContext("2d");
    ctx.strokeStyle = null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.fillStyle = "#000000";
    for(var i = 0; i < 8; ++i) {
        var line = bitmap[i];
        for(var j = 0; j < 8; ++j) {
            if((line >> j) & 0x1)
                ctx.fillRect(j *5, i *5, 5, 5);
        }
    }    
}

function canvasProcessMouse(e, resolve, reject) {
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    if(x >= 0 && x < rect.width && y >= 0 && y < rect.height)
        resolve(Math.floor(y / 48), Math.floor(x / 48));
    else if(reject)
        reject();
}

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.querySelector("#bitmap > canvas");
    previewCanvas = document.querySelector("#preview > canvas");
    redrawBitmap();

    document.addEventListener("mousemove", (e) => {
        canvasProcessMouse(e, (i, j) => {
            if(drawing)
                _setBit(i, j, selectedTool.draw == "pencil");
            else
                _setCursor(i, j);
        }, () => {
            _setCursor(-1, -1);
        });
    });

    document.addEventListener("mousedown", (e) => {
        canvasProcessMouse(e, (i, j) => {
            drawing = true;
            _setBit(i, j, selectedTool.draw == "pencil");
        });
    });

    document.addEventListener("mouseup", (e) => {
        drawing = false;
    });

    document.querySelectorAll(".button").forEach((button) => {
        button.addEventListener("click", (e) => { click.call(button); }, false);
    });

    document.querySelectorAll(".popup").forEach((elem) => {
        elem.addEventListener("animationend", (e) => { elem.classList.remove("popup-anim"); }, false);
    });

    document.addEventListener("keyup", (e) => {
        if(e.key === "Shift" && document.activeElement != document.querySelector("#hexcode-text > input")) {
            click.call(document.getElementById("pencil"));
            redrawBitmap();
        }
    });

    document.addEventListener("keydown", (e) => {
        if(e.key === "Shift" && document.activeElement != document.querySelector("#hexcode-text > input")) {
            click.call(document.getElementById("eraser"));
            redrawBitmap();
        }
        else if(e.ctrlKey) {
            var key = e.key.toLowerCase();
            if(key == "z")
                click.call(document.getElementById("undo"));
            else if(key == "y")
                click.call(document.getElementById("redo"));
        }
    });

    loadSettings();
});
