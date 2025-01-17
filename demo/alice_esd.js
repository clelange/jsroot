// function to extract tracks from ALICE_ESD tree
// tracks are in https://root.cern/files/alice_ESDs.root
// geometry in https://root.cern/files/alice_ESDgeometry.root
// Have to return Promise with list of objects which can be drawn on geometry

async function extract_geo_tracks(tree, opt) {
   // as first argument, tree should be provided

   console.log('CALL async function extract_geo_tracks');

   let handle = await JSROOT.require('tree');

   const selector = new handle.TSelector();

   selector.addBranch("ESDfriend.fTracks.fPoints","pnts");

   let lst = JSROOT.create("TList"), numentry = 0, numtracks = 0;

   selector.Process = function() {
      // function called for every entry

      const pnts = this.tgtobj.pnts;

      numentry++;

      // now converts AliTrackPointArray into TGeoTrack
      for (let p = 0; p < pnts.length; ++p) {
         numtracks++;
         const arr = pnts[p];
         if (!arr.fNPoints) continue;
         const track = JSROOT.create("TGeoTrack");
         track.fNpoints = arr.fNPoints*4;
         track.fPoints = new Float32Array(track.fNpoints*4);
         for (let k = 0; k < arr.fNPoints; ++k) {
            track.fPoints[k*4] = arr.fX[k];
            track.fPoints[k*4+1] = arr.fY[k];
            track.fPoints[k*4+2] = arr.fZ[k];
         }
         track.fLineWidth = 2;
         track.fLineColor = 3;
         lst.Add(track);
         if (numtracks > 100) return this.Abort(); // do not accumulate too many tracks
      }
   }

   selector.Terminate = function() {
      // function called when processing finishes
      console.log(`Read done num entries ${numentry} tracks ${numtracks}`);
   }

   await handle.treeProcess(tree, selector);

   console.log('FINISH extract_geo_tracks');

   return lst;
}

console.log(`LOAD alice_esd.js with JSROOT ${JSROOT.version}`);
