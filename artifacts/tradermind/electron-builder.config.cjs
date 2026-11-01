module.exports = {
  appId: 'com.tradermind.journal',
  productName: 'TraderMind',
  directories: {
    output: 'dist/windows',
  },
  files: [
    'desktop/**/*',
    'dist/public/**/*',
    'package.json',
  ],
  extraMetadata: {
    main: 'desktop/main.cjs',
  },
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] },
    ],
    artifactName: '${productName}-${version}-Windows-${arch}.${ext}',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
  portable: {
    artifactName: '${productName}-${version}-Windows-${arch}-Portable.${ext}',
  },
};
