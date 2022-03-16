import { settings } from '../core.mjs';

import { RH1Painter as RH1Painter2D } from '../hist2d/RH1Painter.mjs';

import { assignFrame3DMethods, drawBinsLego } from './draw3dv7.mjs';


class RH1Painter extends RH1Painter2D {

   /** @summary Draw 1-D histogram in 3D mode */
   async draw3D(reason) {

      this.mode3d = true;

      let main = this.getFramePainter(), // who makes axis drawing
          is_main = this.isMainPainter(); // is main histogram

      if (reason == "resize")  {
         if (is_main && main.resize3D()) main.render3D();
         return this;
      }

      this.deleteAttr();

      this.scanContent(true); // may be required for axis drawings

      if (is_main) {
         assignFrame3DMethods(main);
         await main.create3DScene(this.options.Render3D);
         main.setAxesRanges(this.getAxis("x"), this.xmin, this.xmax, null, this.ymin, this.ymax, null, 0, 0);
         main.set3DOptions(this.options);
         main.drawXYZ(main.toplevel, { use_y_for_z: true, zmult: 1.1, zoom: settings.Zooming, ndim: 1 });
      }

      if (main.mode3d) {
         await this.drawingBins(reason);

         // called when bins received from server, must be reentrant
         let main = this.getFramePainter();

         drawBinsLego(this);
         this.updatePaletteDraw();
         main.render3D();
         main.addKeysHandler();
      }

      return this;
   }

      /** @summary draw RH1 object */
   static async draw(dom, histo, opt) {
      return RH1Painter._draw(new RH1Painter(dom, histo), opt);
   }

} // class RH1Painter

export { RH1Painter };
