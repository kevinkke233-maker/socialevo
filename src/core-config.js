// Core runtime configuration for SocialEvoNPC.
// Keep constants and low-level sprite/layout helpers here so runtime modules can focus on game flow.
(function () {
  const modelOptions = [
    "deepseek-flash",
    "deepseek-pro"
  ];

  const evolutionModes = [
    "static",
    "memory-only",
    "self-evolving",
    "self-evolving-no-rag",
    "self-evolving-no-relationship-strategy"
  ];

  const relationshipKeys = ["competence", "care", "reliability", "disruption"];

  const valueTradeoffKeys = ["task", "inclusion", "fairness", "psychologicalSafety"];

  const DEEPSEEK_FLASH_MODEL = "deepseek-flash";

  const DEEPSEEK_PRO_MODEL = "deepseek-pro";

  const API_CONTRACT_VERSION = "socialevo-api-v3";

  const BUILD_VERSION = "anonymous-release";

  const CHAT_REQUEST_TIMEOUT_MS = 165000;

  const discussionOffsets = [
    { x: -7, y: -4 },
    { x: 7, y: -4 },
    { x: -8, y: 8 },
    { x: 8, y: 8 },
    { x: 0, y: 12 }
  ];

  const characterSeparation = { x: 2.6, y: 6.2 };

  const propCollisionPadding = characterSeparation.x;

  const playerMoveStep = 2;

  const interactionRange = { x: 6.2, y: 13.5 };

  const conversationStayRange = { x: 6.5, y: 13.5 };

  const directionColumns = {
    left: 23,
    down: 24,
    up: 25,
    right: 26
  };

  const spriteTile = (col, row) => ({ x: col * 17, y: row * 17 });

  const assetSprite = (url, options = {}) => ({
    type: options.columns && options.rows ? "image-grid" : "image-static",
    url,
    frameWidth: options.frameWidth || 16,
    frameHeight: options.frameHeight || 16,
    columns: options.columns || 1,
    rows: options.rows || 1,
    scale: options.scale || 3,
    directionColumns: options.directionColumns || { down: 0, up: 1, left: 2, right: 3 },
    frameRows: options.frameRows || null,
    displayWidth: options.displayWidth || null,
    displayHeight: options.displayHeight || null,
    idleRow: options.idleRow || 0,
    frameRow: options.frameRow || 0,
    frameColumn: options.frameColumn || 0,
    avatarUrl: options.avatarUrl || ""
  });

  const peerSprite = (file) => assetSprite(`./assets/scenarios/peer-support/${file}`, { frameWidth: 16, frameHeight: 16, scale: 3 });

  const tinyCharacterDirectionColumns = { down: 0, right: 1, up: 2, left: 3 };

  const peerWalker = (file) => assetSprite(`./assets/scenarios/peer-support/walkers/${file}`, {
    frameWidth: 16,
    frameHeight: 17,
    columns: 4,
    rows: 3,
    scale: 3,
    directionColumns: tinyCharacterDirectionColumns,
    frameRows: [0, 1, 2],
    displayWidth: 48,
    displayHeight: 51,
    avatarUrl: `./assets/scenarios/peer-support/walkers/avatars/${file}`
  });

  const peerAvatar = (file) => assetSprite(`./assets/scenarios/peer-support/walkers/avatars/${file}`, {
    frameWidth: 16,
    frameHeight: 17,
    scale: 1
  });

  const communityAvatar = (file) => assetSprite(`./assets/scenarios/community-volunteer/avatars/${file}`, {
    frameWidth: 16,
    frameHeight: 17,
    scale: 1
  });

  const communitySprite = (file) => assetSprite(`./assets/scenarios/community-volunteer/${file}`, {
    frameWidth: 16,
    frameHeight: 17,
    columns: 4,
    rows: 3,
    scale: 3,
    directionColumns: tinyCharacterDirectionColumns,
    frameRows: [0, 1, 2],
    displayWidth: 48,
    displayHeight: 51,
    avatarUrl: `./assets/scenarios/community-volunteer/avatars/${file}`
  });

  const playerSprite = spriteTile(24, 13);

  const npcSprites = {
    mina: spriteTile(24, 4),
    leo: spriteTile(24, 1),
    sam: spriteTile(24, 10),
    riley: spriteTile(24, 16),
    nora: spriteTile(24, 7)
  };

  // Calibrated, portrait-matched atlases; PNG sources remain unmodified.
  const labWalker = (id) => ({
    type: "image-calibrated",
    ...window.SocialEvoLabArt.characters[id],
    artVersion: window.SocialEvoLabArt.version,
    avatarUrl: `./assets/portraits/lab-entry/${id}/neutral.png`
  });

  const visualSpriteSets = {
    newcomer: {
      player: labWalker("player"),
      npcs: {
        mina: labWalker("mina"),
        leo: labWalker("leo"),
        sam: labWalker("sam"),
        riley: labWalker("riley"),
        nora: labWalker("nora")
      }
    },
    peerSupport: {
      player: peerWalker("player.png"),
      playerAvatar: peerAvatar("player.png"),
      npcs: {
        mina: peerWalker("lin.png"),
        leo: peerWalker("yuqing.png"),
        sam: peerWalker("atai.png"),
        riley: peerWalker("man.png"),
        nora: peerWalker("xu.png")
      },
      npcAvatars: {
        mina: peerAvatar("lin.png"),
        leo: peerAvatar("yuqing.png"),
        sam: peerAvatar("atai.png"),
        riley: peerAvatar("man.png"),
        nora: peerAvatar("xu.png")
      }
    },
    communityVolunteer: {
      player: communitySprite("player.png"),
      playerAvatar: communityAvatar("player.png"),
      npcs: {
        mina: communitySprite("liang.png"),
        leo: communitySprite("mo.png"),
        sam: communitySprite("he.png"),
        riley: communitySprite("joanne.png"),
        nora: communitySprite("lian.png")
      },
      npcAvatars: {
        mina: communityAvatar("liang.png"),
        leo: communityAvatar("mo.png"),
        sam: communityAvatar("he.png"),
        riley: communityAvatar("joanne.png"),
        nora: communityAvatar("lian.png")
      }
    }
  };

  const scenarioLayouts = {
    "newcomer-circle": {
      worldClass: "room-newcomer-layout",
      playerStart: { x: 50, y: 84 },
      openingPlayerPosition: { x: 31, y: 67 },
      taskBoardObject: { id: "task-board", position: { x: 15, y: 74 } },
      walkableBounds: { minX: 8, maxX: 92, minY: 25, maxY: 84 },
      collisionObstacles: [
        // Reference-floor geometry shared with rendering and the CLI audit.
        { id: "table", x1: 40.5556, y1: 58.7442, x2: 61.4444, y2: 62 },
        { id: "chair-top-left", x1: 42.4167, y1: 51.6047, x2: 43.5833, y2: 53, padding: 0.6 },
        { id: "chair-top-right", x1: 58.4167, y1: 51.6047, x2: 59.5833, y2: 53, padding: 0.6 },
        { id: "chair-bottom-left", x1: 42.4167, y1: 68.6047, x2: 43.5833, y2: 70, padding: 0.6 },
        { id: "chair-bottom-right", x1: 58.4167, y1: 68.6047, x2: 59.5833, y2: 70, padding: 0.6 },
        { id: "plant-right", x1: 87.8458, y1: 36.6047, x2: 92.1542, y2: 38, padding: 0.6 },
        { id: "task-board-wall", x1: 9.125, y1: 69.3721, x2: 20.875, y2: 71 },
        { id: "desk-mina", x1: 19.6, y1: 41.3721, x2: 30.4, y2: 43, padding: 0.6 },
        { id: "desk-leo", x1: 42.6, y1: 36.3721, x2: 53.4, y2: 38, padding: 0.6 },
        { id: "desk-riley", x1: 56.6, y1: 36.3721, x2: 67.4, y2: 38, padding: 0.6 },
        { id: "desk-sam", x1: 73.6, y1: 58.3721, x2: 84.4, y2: 60, padding: 0.6 },
        { id: "desk-nora", x1: 70.6, y1: 75.3721, x2: 81.4, y2: 77, padding: 0.6 },
        { id: "water-cooler", x1: 8.55, y1: 36.2, x2: 11.45, y2: 38, padding: 0.6 }
      ]
    },
    "peer-support": {
      worldClass: "room-peer-layout",
      playerStart: { x: 50, y: 84 },
      openingPlayerPosition: { x: 30, y: 70 },
      taskBoardObject: { id: "task-board", position: { x: 23, y: 30 } },
      walkableBounds: { minX: 9, maxX: 91, minY: 24, maxY: 84 },
      collisionObstacles: [
        { id: "support-circle-table", x1: 43, y1: 47, x2: 56, y2: 58 },
        { id: "support-seat-left", x1: 34.5, y1: 47.5, x2: 38.5, y2: 54.5 },
        { id: "support-seat-right", x1: 60.5, y1: 48.5, x2: 64.5, y2: 55.5 },
        { id: "support-seat-bottom", x1: 47, y1: 63, x2: 53, y2: 69 },
        { id: "support-seat-bottom-right", x1: 54, y1: 63, x2: 58, y2: 69 },
        { id: "resource-branch", x1: 76, y1: 25, x2: 81, y2: 35 },
        { id: "support-board-wall", x1: 12, y1: 15, x2: 34, y2: 24 }
      ]
    },
    "community-volunteer": {
      worldClass: "room-community-layout",
      playerStart: { x: 49, y: 83 },
      openingPlayerPosition: { x: 32, y: 68 },
      taskBoardObject: { id: "task-board", position: { x: 18, y: 34 } },
      walkableBounds: { minX: 8, maxX: 92, minY: 23, maxY: 84 },
      collisionObstacles: [
        { id: "supply-table", x1: 30, y1: 54, x2: 49, y2: 65 },
        { id: "crate-left", x1: 18, y1: 56, x2: 23, y2: 64 },
        { id: "crate-right", x1: 56, y1: 58, x2: 62, y2: 66 },
        { id: "route-map-board", x1: 10, y1: 17, x2: 31, y2: 27 },
        { id: "community-tree", x1: 75, y1: 26, x2: 81, y2: 38 },
        { id: "market-stall", x1: 63, y1: 70, x2: 80, y2: 80 }
      ]
    }
  };

  const dialogueTiming = {
    opening: { min: 2000, max: 10000, zhPerChar: 95, enPerChar: 40 },
    npcResponse: { min: 2200, max: 12000, zhPerChar: 105, enPerChar: 42 },
    sideTalk: { min: 2400, max: 13000, zhPerChar: 110, enPerChar: 44 },
    bridge: { min: 1900, max: 9000, zhPerChar: 90, enPerChar: 36 },
    system: { min: 1700, max: 8000, zhPerChar: 80, enPerChar: 32 },
    playerDecision: { min: 1200, max: 4500, zhPerChar: 45, enPerChar: 18 }
  };

  window.SocialEvoConfig = {
    modelOptions,
    evolutionModes,
    relationshipKeys,
    valueTradeoffKeys,
    DEEPSEEK_FLASH_MODEL,
    DEEPSEEK_PRO_MODEL,
    API_CONTRACT_VERSION,
    BUILD_VERSION,
    CHAT_REQUEST_TIMEOUT_MS,
    discussionOffsets,
    characterSeparation,
    propCollisionPadding,
    playerMoveStep,
    interactionRange,
    conversationStayRange,
    directionColumns,
    spriteTile,
    assetSprite,
    peerSprite,
    communitySprite,
    playerSprite,
    npcSprites,
    visualSpriteSets,
    scenarioLayouts,
    dialogueTiming
  };
})();
