/// JavaScript ROOT graphics for ROOT v7 classes

import { settings, create, parse,
         addMethods, registerMethods, isBatchMode } from '../core.mjs';

import { select as d3_select, rgb as d3_rgb, pointer as d3_pointer } from '../d3.mjs';

import { closeCurrentWindow, showProgress, loadOpenui5, ToolbarIcons } from '../utils.mjs';

import { GridDisplay } from '../display.mjs';

import { RObjectPainter } from '../base/RObjectPainter.mjs';

import { selectActivePad, cleanup, resize } from '../painter.mjs';

import { createMenu } from '../menu.mjs';

import { RAxisPainter } from './RAxisPainter.mjs';

import { RFramePainter } from './RFramePainter.mjs';

import { RPadPainter } from './RPadPainter.mjs';

import { addDragHandler } from './TFramePainter.mjs';


/**
 * @summary Painter class for RCanvas
 *
 * @private
 */

class RCanvasPainter extends RPadPainter {

   /** @summary constructor */
   constructor(dom, canvas) {
      super(dom, canvas, true);
      this._websocket = null;
      this.tooltip_allowed = settings.Tooltip;
      this.v7canvas = true;
   }

   /** @summary Cleanup canvas painter */
   cleanup() {
      delete this._websocket;
      delete this._submreq;

     if (this._changed_layout)
         this.setLayoutKind('simple');
      delete this._changed_layout;

      super.cleanup();
   }

   /** @summary Returns layout kind */
   getLayoutKind() {
      let origin = this.selectDom('origin'),
         layout = origin.empty() ? "" : origin.property('layout');
      return layout || 'simple';
   }

   /** @summary Set canvas layout kind */
   setLayoutKind(kind, main_selector) {
      let origin = this.selectDom('origin');
      if (!origin.empty()) {
         if (!kind) kind = 'simple';
         origin.property('layout', kind);
         origin.property('layout_selector', (kind != 'simple') && main_selector ? main_selector : null);
         this._changed_layout = (kind !== 'simple'); // use in cleanup
      }
   }

   /** @summary Changes layout
     * @returns {Promise} indicating when finished */
   changeLayout(layout_kind, mainid) {
      let current = this.getLayoutKind();
      if (current == layout_kind)
         return Promise.resolve(true);

      let origin = this.selectDom('origin'),
          sidebar = origin.select('.side_panel'),
          main = this.selectDom(), lst = [];

      while (main.node().firstChild)
         lst.push(main.node().removeChild(main.node().firstChild));

      if (!sidebar.empty()) cleanup(sidebar.node());

      this.setLayoutKind("simple"); // restore defaults
      origin.html(""); // cleanup origin

      if (layout_kind == 'simple') {
         main = origin;
         for (let k = 0; k < lst.length; ++k)
            main.node().appendChild(lst[k]);
         this.setLayoutKind(layout_kind);
      } else {
         let grid = new GridDisplay(origin.node(), layout_kind);

         if (mainid == undefined)
            mainid = (layout_kind.indexOf("vert") == 0) ? 0 : 1;

         main = d3_select(grid.getGridFrame(mainid));
         sidebar = d3_select(grid.getGridFrame(1 - mainid));

         main.classed("central_panel", true).style('position', 'relative');
         sidebar.classed("side_panel", true).style('position', 'relative');

         // now append all childs to the new main
         for (let k = 0; k < lst.length; ++k)
            main.node().appendChild(lst[k]);

         this.setLayoutKind(layout_kind, ".central_panel");

         // remove reference to MDIDisplay, solves resize problem
         origin.property('mdi', null);
      }

      // resize main drawing and let draw extras
      resize(main.node());
      return Promise.resolve(true);
   }

   /** @summary Toggle projection
     * @returns {Promise} indicating when ready
     * @private */
   toggleProjection(kind) {
      delete this.proj_painter;

      if (kind) this.proj_painter = 1; // just indicator that drawing can be preformed

      if (this.showUI5ProjectionArea)
         return this.showUI5ProjectionArea(kind);

      let layout = 'simple', mainid;

      switch(kind) {
         case "X":
         case "bottom": layout = 'vert2_31'; mainid = 0; break;
         case "Y":
         case "left": layout = 'horiz2_13'; mainid = 1; break;
         case "top": layout = 'vert2_13'; mainid = 1; break;
         case "right": layout = 'horiz2_31'; mainid = 0; break;
      }

      return this.changeLayout(layout, mainid);
   }

   /** @summary Draw projection for specified histogram
     * @private */
   drawProjection( /*kind,hist*/) {
      // dummy for the moment
   }

   /** @summary Draw in side panel
     * @private */
   drawInSidePanel(canv, opt) {
      let side = this.selectDom('origin').select(".side_panel");
      if (side.empty()) return Promise.resolve(null);
      return this.drawObject(side.node(), canv, opt);
   }

   /** @summary Checks if canvas shown inside ui5 widget
     * @desc Function should be used only from the func which supposed to be replaced by ui5
     * @private */
   testUI5() {
      if (!this.use_openui) return false;
      console.warn("full ui5 should be used - not loaded yet? Please check!!");
      return true;
   }

   /** @summary Show message
     * @desc Used normally with web-based canvas and handled in ui5
     * @private */
   showMessage(msg) {
      if (!this.testUI5())
         showProgress(msg, 7000);
   }

   /** @summary Function called when canvas menu item Save is called */
   saveCanvasAsFile(fname) {
      let pnt = fname.indexOf(".");
      this.createImage(fname.substr(pnt+1))
          .then(res => { console.log('save', fname, res.length); this.sendWebsocket("SAVE:" + fname + ":" + res); });
   }

   /** @summary Send command to server to save canvas with specified name
     * @desc Should be only used in web-based canvas
     * @private */
   sendSaveCommand(fname) {
      this.sendWebsocket("PRODUCE:" + fname);
   }

   /** @summary Send message via web socket
     * @private */
   sendWebsocket(msg, chid) {
      if (this._websocket)
         this._websocket.send(msg, chid);
   }

   /** @summary Close websocket connection to canvas
     * @private */
   closeWebsocket(force) {
      if (this._websocket) {
         this._websocket.close(force);
         this._websocket.cleanup();
         delete this._websocket;
      }
   }

   /** @summary Use provided connection for the web canvas
     * @private */
   useWebsocket(handle) {
      this.closeWebsocket();

      this._websocket = handle;
      this._websocket.setReceiver(this);
      this._websocket.connect();
   }

   /** @summary Hanler for websocket open event
     * @private */
   onWebsocketOpened(/*handle*/) {
   }

   /** @summary Hanler for websocket close event
     * @private */
   onWebsocketClosed(/*handle*/) {
      if (!this.embed_canvas)
         closeCurrentWindow();
   }

   /** @summary Hanler for websocket message
     * @private */
   onWebsocketMsg(handle, msg) {
      console.log("GET_MSG " + msg.substr(0,30));

      if (msg == "CLOSE") {
         this.onWebsocketClosed();
         this.closeWebsocket(true);
      } else if (msg.substr(0,5)=='SNAP:') {
         msg = msg.substr(5);
         let p1 = msg.indexOf(":"),
             snapid = msg.substr(0,p1),
             snap = parse(msg.substr(p1+1));
         this.syncDraw(true)
             .then(() => this.redrawPadSnap(snap))
             .then(() => {
                 handle.send("SNAPDONE:" + snapid); // send ready message back when drawing completed
                 this.confirmDraw();
              });
      } else if (msg.substr(0,4)=='JSON') {
         let obj = parse(msg.substr(4));
         // console.log("get JSON ", msg.length-4, obj._typename);
         this.redrawObject(obj);
      } else if (msg.substr(0,9)=="REPL_REQ:") {
         this.processDrawableReply(msg.substr(9));
      } else if (msg.substr(0,4)=='CMD:') {
         msg = msg.substr(4);
         let p1 = msg.indexOf(":"),
             cmdid = msg.substr(0,p1),
             cmd = msg.substr(p1+1),
             reply = "REPLY:" + cmdid + ":";
         if ((cmd == "SVG") || (cmd == "PNG") || (cmd == "JPEG")) {
            this.createImage(cmd.toLowerCase())
                .then(res => handle.send(reply + res));
         } else if (cmd.indexOf("ADDPANEL:") == 0) {
            let relative_path = cmd.substr(9);
            if (!this.showUI5Panel) {
               handle.send(reply + "false");
            } else import('./webwindow.mjs').then(hh => {

               let conn = new hh.WebWindowHandle(handle.kind);

               // set interim receiver until first message arrives
               conn.setReceiver({
                  cpainter: this,

                  onWebsocketOpened: function() {
                  },

                  onWebsocketMsg: function(panel_handle, msg) {
                     let panel_name = (msg.indexOf("SHOWPANEL:")==0) ? msg.substr(10) : "";
                     this.cpainter.showUI5Panel(panel_name, panel_handle)
                                  .then(res => handle.send(reply + (res ? "true" : "false")));
                  },

                  onWebsocketClosed: function() {
                     // if connection failed,
                     handle.send(reply + "false");
                  },

                  onWebsocketError: function() {
                     // if connection failed,
                     handle.send(reply + "false");
                  }

               });

               let addr = handle.href;
               if (relative_path.indexOf("../")==0) {
                  let ddd = addr.lastIndexOf("/",addr.length-2);
                  addr = addr.substr(0,ddd) + relative_path.substr(2);
               } else {
                  addr += relative_path;
               }
               // only when connection established, panel will be activated
               conn.connect(addr);
            });
         } else {
            console.log('Unrecognized command ' + cmd);
            handle.send(reply);
         }
      } else if ((msg.substr(0,7)=='DXPROJ:') || (msg.substr(0,7)=='DYPROJ:')) {
         let kind = msg[1],
             hist = parse(msg.substr(7));
         this.drawProjection(kind, hist);
      } else if (msg.substr(0,5)=='SHOW:') {
         let that = msg.substr(5),
             on = that[that.length-1] == '1';
         this.showSection(that.substr(0,that.length-2), on);
      } else {
         console.log("unrecognized msg len:" + msg.length + " msg:" + msg.substr(0,20));
      }
   }

   /** @summary Submit request to RDrawable object on server side */
   submitDrawableRequest(kind, req, painter, method) {

      if (!this._websocket || !req || !req._typename ||
          !painter.snapid || (typeof painter.snapid != "string")) return null;

      if (kind && method) {
         // if kind specified - check if such request already was submitted
         if (!painter._requests) painter._requests = {};

         let prevreq = painter._requests[kind];

         if (prevreq) {
            let tm = new Date().getTime();
            if (!prevreq._tm || (tm - prevreq._tm < 5000)) {
               prevreq._nextreq = req; // submit when got reply
               return false;
            }
            delete painter._requests[kind]; // let submit new request after timeout
         }

         painter._requests[kind] = req; // keep reference on the request
      }

      req.id = painter.snapid;

      if (method) {
         if (!this._nextreqid) this._nextreqid = 1;
         req.reqid = this._nextreqid++;
      } else {
         req.reqid = 0; // request will not be replied
      }

      let msg = JSON.stringify(req);

      if (req.reqid) {
         req._kind = kind;
         req._painter = painter;
         req._method = method;
         req._tm = new Date().getTime();

         if (!this._submreq) this._submreq = {};
         this._submreq[req.reqid] = req; // fast access to submitted requests
      }

      // console.log('Sending request ', msg.substr(0,60));

      this.sendWebsocket("REQ:" + msg);
      return req;
   }

   /** @summary Submit menu request
     * @private */
   submitMenuRequest(painter, menukind, reqid) {
      return new Promise(resolveFunc => {
         this.submitDrawableRequest("", {
            _typename: "ROOT::Experimental::RDrawableMenuRequest",
            menukind: menukind || "",
            menureqid: reqid, // used to identify menu request
         }, painter, resolveFunc);
      });
   }

   /** @summary Submit executable command for given painter */
   submitExec(painter, exec, subelem) {
      console.log('SubmitExec', exec, painter.snapid, subelem);

      // snapid is intentionally ignored - only painter.snapid has to be used
      if (!this._websocket) return;

      if (subelem) {
         if ((subelem == "x") || (subelem == "y") || (subelem == "z"))
            exec = subelem + "axis#" + exec;
         else
            return console.log(`not recoginzed subelem ${subelem} in SubmitExec`);
       }

      this.submitDrawableRequest("", {
         _typename: "ROOT::Experimental::RDrawableExecRequest",
         exec: exec
      }, painter);
   }

   /** @summary Process reply from request to RDrawable */
   processDrawableReply(msg) {
      let reply = parse(msg);
      if (!reply || !reply.reqid || !this._submreq) return false;

      let req = this._submreq[reply.reqid];
      if (!req) return false;

      // remove reference first
      delete this._submreq[reply.reqid];

      // remove blocking reference for that kind
      if (req._painter && req._kind && req._painter._requests)
         if (req._painter._requests[req._kind] === req)
            delete req._painter._requests[req._kind];

      if (req._method)
         req._method(reply, req);

      // resubmit last request of that kind
      if (req._nextreq && !req._painter._requests[req._kind])
         this.submitDrawableRequest(req._kind, req._nextreq, req._painter, req._method);
   }

   /** @summary Show specified section in canvas */
   showSection(that, on) {
      switch(that) {
         case "Menu": break;
         case "StatusBar": break;
         case "Editor": break;
         case "ToolBar": break;
         case "ToolTips": this.setTooltipAllowed(on); break;
      }
      return Promise.resolve(true);
   }

   /** @summary Method informs that something was changed in the canvas
     * @desc used to update information on the server (when used with web6gui)
     * @private */
   processChanges(kind, painter, subelem) {
      // check if we could send at least one message more - for some meaningful actions
      if (!this._websocket || !this._websocket.canSend(2) || (typeof kind !== "string")) return;

      let msg = "";
      if (!painter) painter = this;
      switch (kind) {
         case "sbits":
            console.log("Status bits in RCanvas are changed - that to do?");
            break;
         case "frame": // when moving frame
         case "zoom":  // when changing zoom inside frame
            console.log("Frame moved or zoom is changed - that to do?");
            break;
         case "pave_moved":
            console.log('TPave is moved inside RCanvas - that to do?');
            break;
         default:
            if ((kind.substr(0,5) == "exec:") && painter && painter.snapid) {
               this.submitExec(painter, kind.substr(5), subelem);
            } else {
               console.log("UNPROCESSED CHANGES", kind);
            }
      }

      if (msg) {
         console.log("RCanvas::processChanges want to send  " + msg.length + "  " + msg.substr(0,40));
      }
   }

   /** @summary Handle pad button click event
     * @private */
   clickPadButton(funcname, evnt) {
      if (funcname == "ToggleGed") return this.activateGed(this, null, "toggle");
      if (funcname == "ToggleStatus") return this.activateStatusBar("toggle");
      super.clickPadButton(funcname, evnt);
   }

   /** @summary returns true when event status area exist for the canvas */
   hasEventStatus() {
      if (this.testUI5()) return false;
      return this.brlayout ? this.brlayout.hasStatus() : false;
   }

   /** @summary Show/toggle event status bar
     * @private */
   activateStatusBar(state) {
      if (this.testUI5()) return;
      if (this.brlayout)
         this.brlayout.createStatusLine(23, state);
      this.processChanges("sbits", this);
   }

   /** @summary Returns true if GED is present on the canvas */
   hasGed() {
      if (this.testUI5()) return false;
      return this.brlayout ? this.brlayout.hasContent() : false;
   }

   /** @summary Function used to de-activate GED
     * @private */
   removeGed() {
      if (this.testUI5()) return;

      this.registerForPadEvents(null);

      if (this.ged_view) {
         this.ged_view.getController().cleanupGed();
         this.ged_view.destroy();
         delete this.ged_view;
      }
      if (this.brlayout)
         this.brlayout.deleteContent();

      this.processChanges("sbits", this);
   }

   /** @summary Function used to activate GED
     * @returns {Promise} when GED is there
     * @private */
   activateGed(objpainter, kind, mode) {
      if (this.testUI5() || !this.brlayout)
         return Promise.resolve(false);

      if (this.brlayout.hasContent()) {
         if ((mode === "toggle") || (mode === false)) {
            this.removeGed();
         } else {
            let pp = objpainter ? objpainter.getPadPainter() : null;
            if (pp) pp.selectObjectPainter(objpainter);
         }

         return Promise.resolve(true);
      }

      if (mode === false)
         return Promise.resolve(false);

      let btns = this.brlayout.createBrowserBtns();

      ToolbarIcons.createSVG(btns, ToolbarIcons.diamand, 15, "toggle fix-pos mode")
                  .style("margin","3px").on("click", () => this.brlayout.toggleKind('fix'));

      ToolbarIcons.createSVG(btns, ToolbarIcons.circle, 15, "toggle float mode")
                  .style("margin","3px").on("click", () => this.brlayout.toggleKind('float'));

      ToolbarIcons.createSVG(btns, ToolbarIcons.cross, 15, "delete GED")
                  .style("margin","3px").on("click", () => this.removeGed());

      // be aware, that jsroot_browser_hierarchy required for flexible layout that element use full browser area
      this.brlayout.setBrowserContent("<div class='jsroot_browser_hierarchy' id='ged_placeholder'>Loading GED ...</div>");
      this.brlayout.setBrowserTitle("GED");
      this.brlayout.toggleBrowserKind(kind || "float");

      return new Promise(resolveFunc => {

         loadOpenui5.then(sap => {

            d3_select("#ged_placeholder").text("");

            sap.ui.define(["sap/ui/model/json/JSONModel", "sap/ui/core/mvc/XMLView"], (JSONModel,XMLView) => {

               let oModel = new JSONModel({ handle: null });

               XMLView.create({
                  viewName: "rootui5.canv.view.Ged"
               }).then(oGed => {

                  oGed.setModel(oModel);

                  oGed.placeAt("ged_placeholder");

                  this.ged_view = oGed;

                  // TODO: should be moved into Ged controller - it must be able to detect canvas painter itself
                  this.registerForPadEvents(oGed.getController().padEventsReceiver.bind(oGed.getController()));

                  let pp = objpainter ? objpainter.getPadPainter() : null;
                  if (pp) pp.selectObjectPainter(objpainter);

                  this.processChanges("sbits", this);

                  resolveFunc(true);
               });
            });
         });
      });
   }

   /** @summary produce JSON for RCanvas, which can be used to display canvas once again
     * @private */
   produceJSON() {
      console.error('RCanvasPainter.produceJSON not yet implemented');
      return "";
   }

   /** @summary draw RCanvas object */
   static draw(dom, can /*, opt */) {
      let nocanvas = !can;
      if (nocanvas)
         can = create("ROOT::Experimental::TCanvas");

      let painter = new RCanvasPainter(dom, can);
      painter.normal_canvas = !nocanvas;
      painter.createCanvasSvg(0);

      selectActivePad({ pp: painter, active: false });

      return painter.drawPrimitives().then(() => {
         painter.addPadButtons();
         painter.showPadButtons();
         return painter;
      });
   }

} // class RCanvasPainter

/** @summary draw RPadSnapshot object
  * @private */
async function drawRPadSnapshot(dom, snap /*, opt*/) {
   let painter = new RCanvasPainter(dom, null);
   painter.normal_canvas = false;
   painter.batch_mode = isBatchMode();
   await painter.syncDraw(true);
   await painter.redrawPadSnap(snap);
   painter.confirmDraw();
   painter.showPadButtons();
   return painter;
}

/** @summary Ensure RCanvas and RFrame for the painter object
  * @param {Object} painter  - painter object to process
  * @param {string|boolean} frame_kind  - false for no frame or "3d" for special 3D mode
  * @desc Assigns DOM, creates and draw RCanvas and RFrame if necessary, add painter to pad list of painters
  * @returns {Promise} for ready */
async function ensureRCanvas(painter, frame_kind) {
   if (!painter)
      throw Error('Painter not provided in ensureRCanvas');

   // simple check - if canvas there, can use painter
   if (painter.getCanvSvg().empty())
      await RCanvasPainter.draw(painter.getDom(), null /* , noframe */);

   if ((frame_kind !== false) && painter.getFrameSvg().select(".main_layer").empty())
      await RFramePainter.draw(painter.getDom(), null, (typeof frame_kind === "string") ? frame_kind : "");

   painter.addToPadPrimitives();
   return painter;
}


const ECorner = { kTopLeft: 1, kTopRight: 2, kBottomLeft: 3, kBottomRight: 4 };

/**
 * @summary Painter for RPave class
 *
 * @private
 */

class RPavePainter extends RObjectPainter {

   /** @summary Draw pave content
     * @desc assigned depending on pave class */
   drawContent() { return Promise.resolve(this); }

   /** @summary Draw pave */
   drawPave() {

      let rect = this.getPadPainter().getPadRect(),
          fp = this.getFramePainter();

      this.onFrame = fp && this.v7EvalAttr("onFrame", true);
      this.corner = this.v7EvalAttr("corner", ECorner.kTopRight);

      let visible      = this.v7EvalAttr("visible", true),
          offsetx      = this.v7EvalLength("offsetX", rect.width, 0.02),
          offsety      = this.v7EvalLength("offsetY", rect.height, 0.02),
          pave_width   = this.v7EvalLength("width", rect.width, 0.3),
          pave_height  = this.v7EvalLength("height", rect.height, 0.3);

      this.createG();

      this.draw_g.classed("most_upper_primitives", true); // this primitive will remain on top of list

      if (!visible) return Promise.resolve(this);

      this.createv7AttLine("border_");

      this.createv7AttFill();

      let pave_x = 0, pave_y = 0,
          fr = this.onFrame ? fp.getFrameRect() : rect;
      switch (this.corner) {
         case ECorner.kTopLeft:
            pave_x = fr.x + offsetx;
            pave_y = fr.y + offsety;
            break;
         case ECorner.kBottomLeft:
            pave_x = fr.x + offsetx;
            pave_y = fr.y + fr.height - offsety - pave_height;
            break;
         case ECorner.kBottomRight:
            pave_x = fr.x + fr.width - offsetx - pave_width;
            pave_y = fr.y + fr.height - offsety - pave_height;
            break;
         case ECorner.kTopRight:
         default:
            pave_x = fr.x + fr.width - offsetx - pave_width;
            pave_y = fr.y + offsety;
      }

      this.draw_g.attr("transform", `translate(${pave_x},${pave_y})`);

      this.draw_g.append("svg:rect")
                 .attr("x", 0)
                 .attr("width", pave_width)
                 .attr("y", 0)
                 .attr("height", pave_height)
                 .call(this.lineatt.func)
                 .call(this.fillatt.func);

      this.pave_width = pave_width;
      this.pave_height = pave_height;

      // here should be fill and draw of text

      return this.drawContent().then(() => {

         if (isBatchMode()) return this;

         // TODO: provide pave context menu as in v6
         if (settings.ContextMenu && this.paveContextMenu)
            this.draw_g.on("contextmenu", evnt => this.paveContextMenu(evnt));

         addDragHandler(this, { x: pave_x, y: pave_y, width: pave_width, height: pave_height,
                                minwidth: 20, minheight: 20, redraw: d => this.sizeChanged(d) });

         return this;
      });
   }

   /** @summary Process interactive moving of the stats box */
   sizeChanged(drag) {
      this.pave_width = drag.width;
      this.pave_height = drag.height;

      let pave_x = drag.x,
          pave_y = drag.y,
          rect = this.getPadPainter().getPadRect(),
          fr = this.onFrame ? this.getFramePainter().getFrameRect() : rect,
          offsetx = 0, offsety = 0, changes = {};

      switch (this.corner) {
         case ECorner.kTopLeft:
            offsetx = pave_x - fr.x;
            offsety = pave_y - fr.y;
            break;
         case ECorner.kBottomLeft:
            offsetx = pave_x - fr.x;
            offsety = fr.y + fr.height - pave_y - this.pave_height;
            break;
         case ECorner.kBottomRight:
            offsetx = fr.x + fr.width - pave_x - this.pave_width;
            offsety = fr.y + fr.height - pave_y - this.pave_height;
            break;
         case ECorner.kTopRight:
         default:
            offsetx = fr.x + fr.width - pave_x - this.pave_width;
            offsety = pave_y - fr.y;
      }

      this.v7AttrChange(changes, "offsetX", offsetx / rect.width);
      this.v7AttrChange(changes, "offsetY", offsety / rect.height);
      this.v7AttrChange(changes, "width", this.pave_width / rect.width);
      this.v7AttrChange(changes, "height", this.pave_height / rect.height);
      this.v7SendAttrChanges(changes, false); // do not invoke canvas update on the server

      this.draw_g.select("rect")
                 .attr("width", this.pave_width)
                 .attr("height", this.pave_height);

      this.drawContent();
   }

   /** @summary Redraw RPave object */
   redraw(/*reason*/) {
      return this.drawPave();
   }

   /** @summary draw RPave object */
   static async draw(dom, pave, opt) {
      let painter = new RPavePainter(dom, pave, opt, "pave");
      await ensureRCanvas(painter, false);
      await painter.drawPave();
      return painter;
   }
}

// =======================================================================================

/** @summary Function used for direct draw of RFrameTitle
  * @private */
function drawRFrameTitle(reason, drag) {
   let fp = this.getFramePainter();
   if (!fp)
      return console.log('no frame painter - no title');

   let rect         = fp.getFrameRect(),
       fx           = rect.x,
       fy           = rect.y,
       fw           = rect.width,
       // fh           = rect.height,
       ph           = this.getPadPainter().getPadHeight(),
       title        = this.getObject(),
       title_margin = this.v7EvalLength("margin", ph, 0.02),
       title_width  = fw,
       title_height = this.v7EvalLength("height", ph, 0.05),
       textFont     = this.v7EvalFont("text", { size: 0.07, color: "black", align: 22 });

   if (reason == 'drag') {
      title_height = drag.height;
      title_margin = fy - drag.y - drag.height;
      let changes = {};
      this.v7AttrChange(changes, "margin", title_margin / ph);
      this.v7AttrChange(changes, "height", title_height / ph);
      this.v7SendAttrChanges(changes, false); // do not invoke canvas update on the server
   }

   this.createG();

   this.draw_g.attr("transform",`translate(${fx},${Math.round(fy-title_margin-title_height)})`);

   let arg = { x: title_width/2, y: title_height/2, text: title.fText, latex: 1 };

   this.startTextDrawing(textFont, 'font');

   this.drawText(arg);

   return this.finishTextDrawing().then(() => {
      if (!isBatchMode())
        addDragHandler(this, { x: fx, y: Math.round(fy-title_margin-title_height), width: title_width, height: title_height,
                               minwidth: 20, minheight: 20, no_change_x: true, redraw: d => this.redraw('drag', d) });
   });
}

////////////////////////////////////////////////////////////////////////////////////////////

registerMethods("ROOT::Experimental::RPalette", {

   extractRColor(rcolor) {
     return rcolor.fColor || "black";
   },

   getColor(indx) {
      return this.palette[indx];
   },

   getContourIndex(zc) {
      let cntr = this.fContour, l = 0, r = cntr.length-1, mid;

      if (zc < cntr[0]) return -1;
      if (zc >= cntr[r]) return r-1;

      if (this.fCustomContour) {
         while (l < r-1) {
            mid = Math.round((l+r)/2);
            if (cntr[mid] > zc) r = mid; else l = mid;
         }
         return l;
      }

      // last color in palette starts from level cntr[r-1]
      return Math.floor((zc-cntr[0]) / (cntr[r-1] - cntr[0]) * (r-1));
   },

   getContourColor(zc) {
      let zindx = this.getContourIndex(zc);
      return (zindx < 0) ? "" : this.getColor(zindx);
   },

   getContour() {
      return this.fContour && (this.fContour.length > 1) ? this.fContour : null;
   },

   deleteContour() {
      delete this.fContour;
   },

   calcColor(value, entry1, entry2) {
      let dist = entry2.fOrdinal - entry1.fOrdinal,
          r1 = entry2.fOrdinal - value,
          r2 = value - entry1.fOrdinal;

      if (!this.fInterpolate || (dist <= 0))
         return (r1 < r2) ? entry2.fColor : entry1.fColor;

      // interpolate
      let col1 = d3_rgb(this.extractRColor(entry1.fColor)),
          col2 = d3_rgb(this.extractRColor(entry2.fColor)),
          color = d3_rgb(Math.round((col1.r*r1 + col2.r*r2)/dist),
                         Math.round((col1.g*r1 + col2.g*r2)/dist),
                         Math.round((col1.b*r1 + col2.b*r2)/dist));

      return color.toString();
   },

   createPaletteColors(len) {
      let arr = [], indx = 0;

      while (arr.length < len) {
         let value = arr.length / (len-1);

         let entry = this.fColors[indx];

         if ((Math.abs(entry.fOrdinal - value)<0.0001) || (indx == this.fColors.length - 1)) {
            arr.push(this.extractRColor(entry.fColor));
            continue;
         }

         let next = this.fColors[indx+1];
         if (next.fOrdinal <= value)
            indx++;
         else
            arr.push(this.calcColor(value, entry, next));
      }

      return arr;
   },

   /** @summary extract color with ordinal value between 0 and 1 */
   getColorOrdinal(value) {
      if (!this.fColors)
         return "black";
      if ((typeof value != "number") || (value < 0))
         value = 0;
      else if (value > 1)
         value = 1;

      // TODO: implement better way to find index

      let entry, next = this.fColors[0];
      for (let indx = 0; indx < this.fColors.length-1; ++indx) {
         entry = next;

         if (Math.abs(entry.fOrdinal - value) < 0.0001)
            return this.extractRColor(entry.fColor);

         next = this.fColors[indx+1];
         if (next.fOrdinal > value)
            return this.calcColor(value, entry, next);
      }

      return this.extractRColor(next.fColor);
   },

   /** @summary set full z scale range, used in zooming */
   setFullRange(min, max) {
       this.full_min = min;
       this.full_max = max;
   },

   createContour(logz, nlevels, zmin, zmax, zminpositive) {
      this.fContour = [];
      delete this.fCustomContour;
      this.colzmin = zmin;
      this.colzmax = zmax;

      if (logz) {
         if (this.colzmax <= 0) this.colzmax = 1.;
         if (this.colzmin <= 0)
            if ((zminpositive===undefined) || (zminpositive <= 0))
               this.colzmin = 0.0001*this.colzmax;
            else
               this.colzmin = ((zminpositive < 3) || (zminpositive>100)) ? 0.3*zminpositive : 1;
         if (this.colzmin >= this.colzmax) this.colzmin = 0.0001*this.colzmax;

         let logmin = Math.log(this.colzmin)/Math.log(10),
             logmax = Math.log(this.colzmax)/Math.log(10),
             dz = (logmax-logmin)/nlevels;
         this.fContour.push(this.colzmin);
         for (let level=1; level<nlevels; level++)
            this.fContour.push(Math.exp((logmin + dz*level)*Math.log(10)));
         this.fContour.push(this.colzmax);
         this.fCustomContour = true;
      } else {
         if ((this.colzmin === this.colzmax) && (this.colzmin !== 0)) {
            this.colzmax += 0.01*Math.abs(this.colzmax);
            this.colzmin -= 0.01*Math.abs(this.colzmin);
         }
         let dz = (this.colzmax-this.colzmin)/nlevels;
         for (let level=0; level<=nlevels; level++)
            this.fContour.push(this.colzmin + dz*level);
      }

      if (!this.palette || (this.palette.length != nlevels))
         this.palette = this.createPaletteColors(nlevels);
   }

});

// =============================================================

/** @summary painter for RPalette
 *
 * @private
 */

class RPalettePainter extends RObjectPainter {

   /** @summary get palette */
   getHistPalette() {
      let drawable = this.getObject(),
          pal = drawable ? drawable.fPalette : null;

      if (pal && !pal.getColor)
         addMethods(pal, "ROOT::Experimental::RPalette");

      return pal;
   }

   /** @summary Draw palette */
   drawPalette(drag) {

      let palette = this.getHistPalette(),
          contour = palette.getContour(),
          framep = this.getFramePainter();

      if (!contour)
         return console.log('no contour - no palette');

      // frame painter must  be there
      if (!framep)
         return console.log('no frame painter - no palette');

      let gmin         = palette.full_min,
          gmax         = palette.full_max,
          zmin         = contour[0],
          zmax         = contour[contour.length-1],
          rect         = framep.getFrameRect(),
          pad_width    = this.getPadPainter().getPadWidth(),
          pad_height   = this.getPadPainter().getPadHeight(),
          visible      = this.v7EvalAttr("visible", true),
          vertical     = this.v7EvalAttr("vertical", true),
          palette_x, palette_y, palette_width, palette_height;

      if (drag) {
         palette_width = drag.width;
         palette_height = drag.height;

         let changes = {};
         if (vertical) {
            this.v7AttrChange(changes, "margin", (drag.x - rect.x - rect.width) / pad_width);
            this.v7AttrChange(changes, "width", palette_width / pad_width);
         } else {
            this.v7AttrChange(changes, "margin", (drag.y - rect.y - rect.height) / pad_width);
            this.v7AttrChange(changes, "width", palette_height / pad_height);
         }
         this.v7SendAttrChanges(changes, false); // do not invoke canvas update on the server
      } else {
          if (vertical) {
            let margin = this.v7EvalLength("margin", pad_width, 0.02);
            palette_x = Math.round(rect.x + rect.width + margin);
            palette_width = this.v7EvalLength("width", pad_width, 0.05);
            palette_y = rect.y;
            palette_height = rect.height;
          } else {
            let margin = this.v7EvalLength("margin", pad_height, 0.02);
            palette_x = rect.x;
            palette_width = rect.width;
            palette_y = Math.round(rect.y + rect.height + margin);
            palette_height = this.v7EvalLength("width", pad_height, 0.05);
          }

          // x,y,width,height attributes used for drag functionality
          this.draw_g.attr("transform",`translate(${palette_x},${palette_y})`);
      }

      let g_btns = this.draw_g.select(".colbtns");
      if (g_btns.empty())
         g_btns = this.draw_g.append("svg:g").attr("class", "colbtns");
      else
         g_btns.selectAll("*").remove();

      if (!visible) return;

      g_btns.append("svg:path")
          .attr("d", `M0,0H${palette_width}V${palette_height}H0Z`)
          .style("stroke", "black")
          .style("fill", "none");

      if ((gmin === undefined) || (gmax === undefined)) { gmin = zmin; gmax = zmax; }

      if (vertical)
         framep.z_handle.configureAxis("zaxis", gmin, gmax, zmin, zmax, true, [palette_height, 0], -palette_height, { reverse: false });
      else
         framep.z_handle.configureAxis("zaxis", gmin, gmax, zmin, zmax, false, [0, palette_width], palette_width, { reverse: false });

      for (let i = 0; i < contour.length-1; ++i) {
         let z0 = Math.round(framep.z_handle.gr(contour[i])),
             z1 = Math.round(framep.z_handle.gr(contour[i+1])),
             col = palette.getContourColor((contour[i]+contour[i+1])/2);

         let r = g_btns.append("svg:path")
                     .attr("d", vertical ? `M0,${z1}H${palette_width}V${z0}H0Z` : `M${z0},0V${palette_height}H${z1}V0Z`)
                     .style("fill", col)
                     .style("stroke", col)
                     .property("fill0", col)
                     .property("fill1", d3_rgb(col).darker(0.5).toString());

         if (this.isTooltipAllowed())
            r.on('mouseover', function() {
               d3_select(this).transition().duration(100).style("fill", d3_select(this).property('fill1'));
            }).on('mouseout', function() {
               d3_select(this).transition().duration(100).style("fill", d3_select(this).property('fill0'));
            }).append("svg:title").text(contour[i].toFixed(2) + " - " + contour[i+1].toFixed(2));

         if (settings.Zooming)
            r.on("dblclick", () => framep.unzoom("z"));
      }

      framep.z_handle.max_tick_size = Math.round(palette_width*0.3);

      let promise = framep.z_handle.drawAxis(this.draw_g, vertical ? `translate(${palette_width},${palette_height})` : `translate(0,${palette_height})`, vertical ? -1 : 1);

      if (isBatchMode() || drag)
         return promise;

      return promise.then(() => {

         if (settings.ContextMenu)
            this.draw_g.on("contextmenu", evnt => {
               evnt.stopPropagation(); // disable main context menu
               evnt.preventDefault();  // disable browser context menu
               createMenu(evnt, this).then(menu => {
                  menu.add("header:Palette");
                  menu.addchk(vertical, "Vertical", flag => { this.v7SetAttr("vertical", flag); this.redrawPad(); });
                  framep.z_handle.fillAxisContextMenu(menu, "z");
                  menu.show();
               });
            });

         addDragHandler(this, { x: palette_x, y: palette_y, width: palette_width, height: palette_height,
                                minwidth: 20, minheight: 20, no_change_x: !vertical, no_change_y: vertical, redraw: d => this.drawPalette(d) });

         if (!settings.Zooming) return;

         let doing_zoom = false, sel1 = 0, sel2 = 0, zoom_rect, zoom_rect_visible, moving_labels, last_pos;

         const moveRectSel = evnt => {

            if (!doing_zoom) return;
            evnt.preventDefault();

            last_pos = d3_pointer(evnt, this.draw_g.node());

            if (moving_labels)
               return framep.z_handle.processLabelsMove('move', last_pos);

            if (vertical)
               sel2 = Math.min(Math.max(last_pos[1], 0), palette_height);
            else
               sel2 = Math.min(Math.max(last_pos[0], 0), palette_width);

            let sz = Math.abs(sel2-sel1);

            if (!zoom_rect_visible && (sz > 1)) {
               zoom_rect.style('display', null);
               zoom_rect_visible = true;
            }

            if (vertical)
               zoom_rect.attr("y", Math.min(sel1, sel2)).attr("height", sz);
            else
               zoom_rect.attr("x", Math.min(sel1, sel2)).attr("width", sz);
         }, endRectSel = evnt => {
            if (!doing_zoom) return;

            evnt.preventDefault();
            d3_select(window).on("mousemove.colzoomRect", null)
                             .on("mouseup.colzoomRect", null);
            zoom_rect.remove();
            zoom_rect = null;
            doing_zoom = false;

            if (moving_labels) {
               framep.z_handle.processLabelsMove('stop', last_pos);
            } else {
               let z = framep.z_handle.func, z1 = z.invert(sel1), z2 = z.invert(sel2);
               this.getFramePainter().zoom("z", Math.min(z1, z2), Math.max(z1, z2));
            }
         }, startRectSel = evnt => {
            // ignore when touch selection is activated
            if (doing_zoom) return;
            doing_zoom = true;

            evnt.preventDefault();
            evnt.stopPropagation();

            last_pos = d3_pointer(evnt, this.draw_g.node());
            sel1 = sel2 = last_pos[vertical ? 1 : 0];
            zoom_rect_visible = false;
            moving_labels = false;
            zoom_rect = g_btns
                 .append("svg:rect")
                 .attr("class", "zoom")
                 .attr("id", "colzoomRect")
                 .style('display', 'none');
            if (vertical)
               zoom_rect.attr("x", 0).attr("width", palette_width).attr("y", sel1).attr("height", 1);
            else
               zoom_rect.attr("x", sel1).attr("width", 1).attr("y", 0).attr("height", palette_height);

            d3_select(window).on("mousemove.colzoomRect", moveRectSel)
                             .on("mouseup.colzoomRect", endRectSel, true);

            setTimeout(() => {
               if (!zoom_rect_visible && doing_zoom)
                  moving_labels = framep.z_handle.processLabelsMove('start', last_pos);
            }, 500);
         },  assignHandlers = () => {
            this.draw_g.selectAll(".axis_zoom, .axis_labels")
                       .on("mousedown", startRectSel)
                       .on("dblclick", () => framep.unzoom("z"));

            if (settings.ZoomWheel)
               this.draw_g.on("wheel", evnt => {
                  evnt.stopPropagation();
                  evnt.preventDefault();

                  let pos = d3_pointer(evnt, this.draw_g.node()),
                      coord = vertical ? (1 - pos[1] / palette_height) : pos[0] / palette_width;

                  let item = framep.z_handle.analyzeWheelEvent(evnt, coord);
                  if (item.changed)
                     framep.zoom("z", item.min, item.max);
               });
         };

         framep.z_handle.setAfterDrawHandler(assignHandlers);

         assignHandlers();
      });
   }

   /** @summary draw RPalette object */
   static async draw(dom, palette, opt) {
      let painter = new RPalettePainter(dom, palette, opt, "palette");
      await ensureRCanvas(painter, false);
      painter.createG(); // just create container, real drawing will be done by histogram
      return painter;
   }

} // class RPalettePainter


/** @summary draw RFont object
  * @private */
function drawRFont() {
   let font   = this.getObject(),
       svg    = this.getCanvSvg(),
       defs   = svg.select('.canvas_defs'),
       clname = "custom_font_" + font.fFamily+font.fWeight+font.fStyle;

   if (defs.empty())
      defs = svg.insert("svg:defs", ":first-child").attr("class", "canvas_defs");

   let entry = defs.select("." + clname);
   if (entry.empty())
      entry = defs.append("style").attr("type", "text/css").attr("class", clname);

   entry.text(`@font-face { font-family: "${font.fFamily}"; font-weight: ${font.fWeight ? font.fWeight : "normal"}; font-style: ${font.fStyle ? font.fStyle : "normal"}; src: ${font.fSrc}; }`);

   if (font.fDefault)
      this.getPadPainter()._dfltRFont = font;

   return true;
}


/** @summary draw RAxis object */
async function drawRAxis(dom, obj, opt) {
   let painter = new RAxisPainter(dom, obj, opt);
   painter.disable_zooming = true;
   await ensureRCanvas(painter, false);
   await painter.redraw();
   return painter;
}

/** @summary draw RFrame object */
async function drawRFrame(dom, obj, opt) {
   let p = new RFramePainter(dom, obj);
   if (opt == "3d") p.mode3d = true;
   await ensureRCanvas(p, false);
   await p.redraw();
   return p;
}

export { ensureRCanvas, drawRPadSnapshot,
         drawRFrameTitle, drawRFont, drawRAxis, drawRFrame,
         RPalettePainter, RPavePainter,
         RObjectPainter, RPadPainter, RCanvasPainter };