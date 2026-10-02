export default () => {
   return {
      enableSceneReloading: true,
      scenes: [
         { name: "simple"      , path: "./simple.js"      , public: true },
         { name: "shapes"      , path: "./shapes.js"      , public: true },
         { name: "jointed"     , path: "./jointed.js"     , public: true },
         { name: "interact"    , path: "./interact.js"    , public: true },
         { name: "beam"        , path: "./beam.js"        , public: true },
         { name: "hw1-cat"     , path: "./hw1-cat.js"     , public: true },
         { name: "lines"       , path: "./lines.js"       , public: true },
         { name: "linefont"    , path: "./linefont.js"    , public: true },
         { name: "linefont2"   , path: "./linefont2.js"   , public: true },
         { name: "wordle"      , path: "./wordle.js"      , public: true },
         { name: "buddha"      , path: "./buddha.js"      , public: true },
         { name: "hw2-airbeat" , path: "./hw2-airbeat.js" , public: true },
         { name: "beamSphere"  , path: "./beamSphere.js"  , public: true },
         { name: "construct"   , path: "./construct.js"   , public: true },
      ]
   };
}