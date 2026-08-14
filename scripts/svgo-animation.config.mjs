export default {
  multipass: true,
  js2svg: { pretty: false },
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          // These exports use display="none" cels that SMIL <set> elements
          // reveal later. Removing hidden nodes destroys the animation.
          removeHiddenElems: false,
          cleanupIds: false,
          collapseGroups: false,
          removeUnknownsAndDefaults: false,
        },
      },
    },
  ],
};
