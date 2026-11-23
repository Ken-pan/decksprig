import type {ResourceAttribution} from './model';

/** Only project-owned AI imagery. Original files and generation records stay preserved. */
export const TEMPLATE_MEDIA:Record<string,{src:string;resource?:ResourceAttribution}>= {
  "monograph-material": {
    "src": "/examples/template-assets/monograph-material.jpg",
    "resource": {
        "id": "template-ai:monograph-material",
        "kind": "photo",
        "provider": "Deckleaf AI",
        "title": "Warm architectural material study",
        "creator": "Deckleaf \u00b7 AI-generated",
        "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/monograph-material.jpg",
        "license": "CC0 1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "attribution": "Original AI material study \u2014 Deckleaf",
        "attributionRequired": false,
        "licenseNotice": "Original project-generated AI visual concept; no research or external-photo claim. Original SHA-256: c65e0e0cf196f5ddda82bdda99a00f38ff0257ad90bb68304469cd916c57205b",
        "originalSha256": "c65e0e0cf196f5ddda82bdda99a00f38ff0257ad90bb68304469cd916c57205b"
    }
},
  "work-05-review": {
    "src": "/examples/template-assets/illustrations/work-05-review.png",
    "resource": {
      "id": "blue-black:work-05-review",
      "kind": "illustration",
      "provider": "Blue & Black",
      "title": "Reviewing design and evidence",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/resources/blue-black-v1/index.html",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Reviewing design and evidence — Deckleaf · AI-generated · CC0 1.0\nhttp://127.0.0.1:4310/resources/blue-black-v1/index.html\nLicense: http://127.0.0.1:4310/resources/blue-black-v1/README.md",
      "attributionRequired": false,
      "licenseNotice": "Project-generated AI artwork dedicated by Ken Pan under CC0 1.0, to the extent he holds rights. Original SHA-256: 3ac3f01dfa236c24d108328360bbdff9c3293a747007801db722a4c7b9664119",
      "originalSha256": "3ac3f01dfa236c24d108328360bbdff9c3293a747007801db722a4c7b9664119",
      "color": "#2f5bff"
    }
  },
  "work-03-usability-test": {
    "src": "/examples/template-assets/illustrations/work-03-usability-test.png",
    "resource": {
      "id": "blue-black:work-03-usability-test",
      "kind": "illustration",
      "provider": "Blue & Black",
      "title": "Observing real tasks",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/resources/blue-black-v1/index.html",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Observing real tasks — Deckleaf · AI-generated · CC0 1.0\nhttp://127.0.0.1:4310/resources/blue-black-v1/index.html\nLicense: http://127.0.0.1:4310/resources/blue-black-v1/README.md",
      "attributionRequired": false,
      "licenseNotice": "Project-generated AI artwork dedicated by Ken Pan under CC0 1.0, to the extent he holds rights. Original SHA-256: bce1eb0f05d3862e789f8385e12d062a4e1fabec81e39a73f07b5b4a042ba9d2",
      "originalSha256": "bce1eb0f05d3862e789f8385e12d062a4e1fabec81e39a73f07b5b4a042ba9d2",
      "color": "#2f5bff"
    }
  },
  "spot-01-search": {
    "src": "/examples/template-assets/illustrations/spot-01-search.png",
    "resource": {
      "id": "blue-black:spot-01-search",
      "kind": "illustration",
      "provider": "Blue & Black",
      "title": "Search",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/resources/blue-black-v1/index.html",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Search — Deckleaf · AI-generated · CC0 1.0\nhttp://127.0.0.1:4310/resources/blue-black-v1/index.html\nLicense: http://127.0.0.1:4310/resources/blue-black-v1/README.md",
      "attributionRequired": false,
      "licenseNotice": "Project-generated AI artwork dedicated by Ken Pan under CC0 1.0, to the extent he holds rights. Original SHA-256: e26a571e3430cfb2edc86a6f1b6ea3022fc2fbf4db0029d32abc9d126127c0ab",
      "originalSha256": "e26a571e3430cfb2edc86a6f1b6ea3022fc2fbf4db0029d32abc9d126127c0ab",
      "color": "#2f5bff"
    }
  },
  "spot-07-compare": {
    "src": "/examples/template-assets/illustrations/spot-07-compare.png",
    "resource": {
      "id": "blue-black:spot-07-compare",
      "kind": "illustration",
      "provider": "Blue & Black",
      "title": "Compare and choose",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/resources/blue-black-v1/index.html",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Compare and choose — Deckleaf · AI-generated · CC0 1.0\nhttp://127.0.0.1:4310/resources/blue-black-v1/index.html\nLicense: http://127.0.0.1:4310/resources/blue-black-v1/README.md",
      "attributionRequired": false,
      "licenseNotice": "Project-generated AI artwork dedicated by Ken Pan under CC0 1.0, to the extent he holds rights. Original SHA-256: 9f8ac0db38ec027d134906e8ff389f49f3b66c357ad35da829af777e02855594",
      "originalSha256": "9f8ac0db38ec027d134906e8ff389f49f3b66c357ad35da829af777e02855594",
      "color": "#2f5bff"
    }
  },
  "spot-22-test": {
    "src": "/examples/template-assets/illustrations/spot-22-test.png",
    "resource": {
      "id": "blue-black:spot-22-test",
      "kind": "illustration",
      "provider": "Blue & Black",
      "title": "Validate and test",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/resources/blue-black-v1/index.html",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Validate and test — Deckleaf · AI-generated · CC0 1.0\nhttp://127.0.0.1:4310/resources/blue-black-v1/index.html\nLicense: http://127.0.0.1:4310/resources/blue-black-v1/README.md",
      "attributionRequired": false,
      "licenseNotice": "Project-generated AI artwork dedicated by Ken Pan under CC0 1.0, to the extent he holds rights. Original SHA-256: ac01b2c1a7c7a563bda7feff98de95b2f2edbe6bb1aa10a45ac69ec0c1245405",
      "originalSha256": "ac01b2c1a7c7a563bda7feff98de95b2f2edbe6bb1aa10a45ac69ec0c1245405",
      "color": "#2f5bff"
    }
  },
  "spot-21-prototype": {
    "src": "/examples/template-assets/illustrations/spot-21-prototype.png",
    "resource": {
      "id": "blue-black:spot-21-prototype",
      "kind": "illustration",
      "provider": "Blue & Black",
      "title": "Interface prototype",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/resources/blue-black-v1/index.html",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Interface prototype — Deckleaf · AI-generated · CC0 1.0\nhttp://127.0.0.1:4310/resources/blue-black-v1/index.html\nLicense: http://127.0.0.1:4310/resources/blue-black-v1/README.md",
      "attributionRequired": false,
      "licenseNotice": "Project-generated AI artwork dedicated by Ken Pan under CC0 1.0, to the extent he holds rights. Original SHA-256: d9215fdfe3f504dccba8b187aa9c0ea3fde9750ed5cc252143f691f2751d8df3",
      "originalSha256": "d9215fdfe3f504dccba8b187aa9c0ea3fde9750ed5cc252143f691f2751d8df3",
      "color": "#2f5bff"
    }
  },
  "spot-13-handoff": {
    "src": "/examples/template-assets/illustrations/spot-13-handoff.png",
    "resource": {
      "id": "blue-black:spot-13-handoff",
      "kind": "illustration",
      "provider": "Blue & Black",
      "title": "Project handoff",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/resources/blue-black-v1/index.html",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Project handoff — Deckleaf · AI-generated · CC0 1.0\nhttp://127.0.0.1:4310/resources/blue-black-v1/index.html\nLicense: http://127.0.0.1:4310/resources/blue-black-v1/README.md",
      "attributionRequired": false,
      "licenseNotice": "Project-generated AI artwork dedicated by Ken Pan under CC0 1.0, to the extent he holds rights. Original SHA-256: 7e5519e62cc539b5ad80233ba9d10f0d34e21f50714e8557de40b21bde90b01e",
      "originalSha256": "7e5519e62cc539b5ad80233ba9d10f0d34e21f50714e8557de40b21bde90b01e",
      "color": "#2f5bff"
    }
  },
  "spot-20-priority": {
    "src": "/examples/template-assets/illustrations/spot-20-priority.png",
    "resource": {
      "id": "blue-black:spot-20-priority",
      "kind": "illustration",
      "provider": "Blue & Black",
      "title": "Priority",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/resources/blue-black-v1/index.html",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Priority — Deckleaf · AI-generated · CC0 1.0\nhttp://127.0.0.1:4310/resources/blue-black-v1/index.html\nLicense: http://127.0.0.1:4310/resources/blue-black-v1/README.md",
      "attributionRequired": false,
      "licenseNotice": "Project-generated AI artwork dedicated by Ken Pan under CC0 1.0, to the extent he holds rights. Original SHA-256: 9111c074262a0f5044d09619e5fc630c8a335e1959a0c57809398f385b4d0995",
      "originalSha256": "9111c074262a0f5044d09619e5fc630c8a335e1959a0c57809398f385b4d0995",
      "color": "#2f5bff"
    }
  },
  "spot-04-complete": {
    "src": "/examples/template-assets/illustrations/spot-04-complete.png",
    "resource": {
      "id": "blue-black:spot-04-complete",
      "kind": "illustration",
      "provider": "Blue & Black",
      "title": "Complete",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/resources/blue-black-v1/index.html",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Complete — Deckleaf · AI-generated · CC0 1.0\nhttp://127.0.0.1:4310/resources/blue-black-v1/index.html\nLicense: http://127.0.0.1:4310/resources/blue-black-v1/README.md",
      "attributionRequired": false,
      "licenseNotice": "Project-generated AI artwork dedicated by Ken Pan under CC0 1.0, to the extent he holds rights. Original SHA-256: 47877d6d26c79025c9bf6c4664d98c3ee151b6816fc94e344247773cf493b890",
      "originalSha256": "47877d6d26c79025c9bf6c4664d98c3ee151b6816fc94e344247773cf493b890",
      "color": "#2f5bff"
    }
  },
  "spot-23-feedback": {
    "src": "/examples/template-assets/illustrations/spot-23-feedback.png",
    "resource": {
      "id": "blue-black:spot-23-feedback",
      "kind": "illustration",
      "provider": "Blue & Black",
      "title": "Comments and feedback",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/resources/blue-black-v1/index.html",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Comments and feedback — Deckleaf · AI-generated · CC0 1.0\nhttp://127.0.0.1:4310/resources/blue-black-v1/index.html\nLicense: http://127.0.0.1:4310/resources/blue-black-v1/README.md",
      "attributionRequired": false,
      "licenseNotice": "Project-generated AI artwork dedicated by Ken Pan under CC0 1.0, to the extent he holds rights. Original SHA-256: 7c2a02112f4d8adac6c6c201be02b0dfb2d343df9e12c7ad4a27b35e14276b9a",
      "originalSha256": "7c2a02112f4d8adac6c6c201be02b0dfb2d343df9e12c7ad4a27b35e14276b9a",
      "color": "#2f5bff"
    }
  },
  "spot-03-workflow": {
    "src": "/examples/template-assets/illustrations/spot-03-workflow.png",
    "resource": {
      "id": "blue-black:spot-03-workflow",
      "kind": "illustration",
      "provider": "Blue & Black",
      "title": "Workflow",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/resources/blue-black-v1/index.html",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Workflow — Deckleaf · AI-generated · CC0 1.0\nhttp://127.0.0.1:4310/resources/blue-black-v1/index.html\nLicense: http://127.0.0.1:4310/resources/blue-black-v1/README.md",
      "attributionRequired": false,
      "licenseNotice": "Project-generated AI artwork dedicated by Ken Pan under CC0 1.0, to the extent he holds rights. Original SHA-256: 5e140c27ed76431a58c1561fcb9584cdb252ee217f5836fa85a291b4e5d35e65",
      "originalSha256": "5e140c27ed76431a58c1561fcb9584cdb252ee217f5836fa85a291b4e5d35e65",
      "color": "#2f5bff"
    }
  },
  "paper": {
    "src": "/examples/template-assets/paper-study.jpg",
    "resource": {
      "id": "template-artwork:paper",
      "kind": "photo",
      "provider": "Deckleaf AI artwork",
      "title": "Paper and terracotta study",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/originals/paper-study.png",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Paper and terracotta study — Deckleaf · AI-generated",
      "attributionRequired": false,
      "licenseNotice": "Original AI output is preserved. JPEG is an optimized presentation copy. No third-party license is claimed.",
      "originalSha256": "df4debc7673a25845693ebc2c45319564b28ea35f2ba4cb173624b1cc4676cdf"
    }
  },
  "coast": {
    "src": "/examples/template-assets/coast-study.jpg",
    "resource": {
      "id": "template-artwork:coast",
      "kind": "photo",
      "provider": "Deckleaf AI artwork",
      "title": "Limestone coast study",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/originals/coast-study.png",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Limestone coast study — Deckleaf · AI-generated",
      "attributionRequired": false,
      "licenseNotice": "Original AI output is preserved. JPEG is an optimized presentation copy. No third-party license is claimed.",
      "originalSha256": "83bc7a74f3de42a8a6ec8e2a108e852b606c129e6ea911aa63610debf6990f8b"
    }
  },
  "material": {
    "src": "/examples/template-assets/material-study.jpg",
    "resource": {
      "id": "template-artwork:material",
      "kind": "photo",
      "provider": "Deckleaf AI artwork",
      "title": "Linen, stone, and copper study",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/originals/material-study.png",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Linen, stone, and copper study — Deckleaf · AI-generated",
      "attributionRequired": false,
      "licenseNotice": "Original AI output is preserved. JPEG is an optimized presentation copy. No third-party license is claimed.",
      "originalSha256": "068e1b9fb8c1fc7892032a60e962011f852bb3bd5b36db03fbf1e40f2b68bad4"
    }
  },
  "glass": {
    "src": "/examples/template-assets/glass-study.jpg",
    "resource": {
      "id": "template-artwork:glass",
      "kind": "photo",
      "provider": "Deckleaf AI artwork",
      "title": "Cobalt glass study",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/originals/glass-study.png",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Cobalt glass study — Deckleaf · AI-generated",
      "attributionRequired": false,
      "licenseNotice": "Original AI output is preserved. JPEG is an optimized presentation copy. No third-party license is claimed.",
      "originalSha256": "5e357556ee26a1a955ca0d297aaeb1329cd8deffef9ba11231cd9557233a79ad"
    }
  }
, "report-relief": {
  "src": "/examples/template-assets/report-relief.jpg",
  "resource": {
    "id": "template-artwork:report-relief",
    "kind": "photo",
    "provider": "Deckleaf AI artwork",
    "title": "Paper relief — a record of progress",
    "creator": "Deckleaf · AI-generated",
    "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/originals/report-relief.png",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "attribution": "Paper relief — Deckleaf · AI-generated",
    "attributionRequired": false,
    "licenseNotice": "Original AI output is preserved. JPEG is an optimized presentation copy. No third-party license is claimed.",
    "originalSha256": "da5a490ac5464f85276f332583b1217681ed2351ae4683839d425a873e5e800b"
  }
}
, 
  "minimal-orbit": {
    "src": "/examples/template-assets/minimal-orbit.jpg",
    "resource": {
      "id": "template-artwork:minimal-orbit",
      "kind": "photo",
      "provider": "Deckleaf AI artwork",
      "title": "Minimalist · Orbit",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/originals/minimal-orbit.png",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Minimalist · Orbit — Deckleaf · AI-generated",
      "attributionRequired": false,
      "licenseNotice": "Original AI output is preserved. JPEG is an optimized presentation copy. Generated specifically for the Minimalist collection. No third-party license is claimed.",
      "originalSha256": "1442fb820fd1daf29262b19c796725d0ebc4c5b43c1144d4ff62c3e99764e781"
    }
  },
  "minimal-fold": {
    "src": "/examples/template-assets/minimal-fold.jpg",
    "resource": {
      "id": "template-artwork:minimal-fold",
      "kind": "photo",
      "provider": "Deckleaf AI artwork",
      "title": "Minimalist · Fold",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/originals/minimal-fold.png",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Minimalist · Fold — Deckleaf · AI-generated",
      "attributionRequired": false,
      "licenseNotice": "Original AI output is preserved. JPEG is an optimized presentation copy. Generated specifically for the Minimalist collection. No third-party license is claimed.",
      "originalSha256": "d74a91994f32ae2f01205a91b3a7cdb45eb1fe72d7f5966e532e1e7c0f8ef6bd"
    }
  },
  "minimal-balance": {
    "src": "/examples/template-assets/minimal-balance.jpg",
    "resource": {
      "id": "template-artwork:minimal-balance",
      "kind": "photo",
      "provider": "Deckleaf AI artwork",
      "title": "Minimalist · Balance",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/originals/minimal-balance.png",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Minimalist · Balance — Deckleaf · AI-generated",
      "attributionRequired": false,
      "licenseNotice": "Original AI output is preserved. JPEG is an optimized presentation copy. Generated specifically for the Minimalist collection. No third-party license is claimed.",
      "originalSha256": "c0906121af824373439d5d4578556124db2fad93552f4919518c693c75e125fa"
    }
  },
  "minimal-void": {
    "src": "/examples/template-assets/minimal-void.jpg",
    "resource": {
      "id": "template-artwork:minimal-void",
      "kind": "photo",
      "provider": "Deckleaf AI artwork",
      "title": "Minimalist · Void",
      "creator": "Deckleaf · AI-generated",
      "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/originals/minimal-void.png",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Minimalist · Void — Deckleaf · AI-generated",
      "attributionRequired": false,
      "licenseNotice": "Original AI output is preserved. JPEG is an optimized presentation copy. Generated specifically for the Minimalist collection. No third-party license is claimed.",
      "originalSha256": "22cab321a10b566f09ab0e616fc09c389cc80ff2a12accfad135a9a2cd550f1f"
    }
  }
,
  "ledger-folio":{
  "src": "/examples/template-assets/ledger-folio.jpg",
  "resource": {
    "id": "template-artwork:ledger-folio",
    "kind": "photo",
    "provider": "Deckleaf AI artwork",
    "title": "Ledger · Quiet report folio",
    "creator": "Deckleaf · AI-generated",
    "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/originals/ledger-folio-ai-original.png",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "attribution": "Ledger · Quiet report folio — Deckleaf · AI-generated",
    "attributionRequired": false,
    "licenseNotice": "Original AI output and prompt are preserved; generated exclusively for Ledger. Decorative cover atmosphere, not data or evidence.",
    "originalSha256": "180b2d043ad9dc8290c2542b97edc44cbea411a367653ec392d07d3e525f27f9"
  }
},
  "ledger-binding":{
  "src": "/examples/template-assets/ledger-binding.jpg",
  "resource": {
    "id": "template-artwork:ledger-binding",
    "kind": "photo",
    "provider": "Deckleaf AI artwork",
    "title": "Ledger · Binding detail",
    "creator": "Deckleaf · AI-generated",
    "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/originals/ledger-binding-ai-original.png",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "attribution": "Ledger · Binding detail — Deckleaf · AI-generated",
    "attributionRequired": false,
    "licenseNotice": "Original AI output and prompt are preserved; generated exclusively for Ledger. Print and material concept, not data or research evidence.",
    "originalSha256": "6d28ec797bd0c1b85e90d333d178de1a940c8706f2ce233e818298ba6369f0d6"
  }
},
  "ledger-closed":{
  "src": "/examples/template-assets/ledger-closed.jpg",
  "resource": {
    "id": "template-artwork:ledger-closed",
    "kind": "photo",
    "provider": "Deckleaf AI artwork",
    "title": "Ledger · Closed edition",
    "creator": "Deckleaf · AI-generated",
    "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/originals/ledger-closed-ai-original.png",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "attribution": "Ledger · Closed edition — Deckleaf · AI-generated",
    "attributionRequired": false,
    "licenseNotice": "Original AI output and prompt are preserved; generated exclusively for Ledger. Print and material concept, not data or research evidence.",
    "originalSha256": "cc62b188344ac029733edd309e27233358ee9cda5b5480ebfedfc2c9fad0cbdd"
  }
},
  "ledger-leaf":{
  "src": "/examples/template-assets/ledger-leaf.jpg",
  "resource": {
    "id": "template-artwork:ledger-leaf",
    "kind": "photo",
    "provider": "Deckleaf AI artwork",
    "title": "Ledger · Turned leaf",
    "creator": "Deckleaf · AI-generated",
    "sourceUrl": "http://127.0.0.1:4310/examples/template-assets/originals/ledger-leaf-ai-original.png",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "attribution": "Ledger · Turned leaf — Deckleaf · AI-generated",
    "attributionRequired": false,
    "licenseNotice": "Original AI output and prompt are preserved; generated exclusively for Ledger. Print and material concept, not data or research evidence.",
    "originalSha256": "9af952fafb4b7c6f29aed7de62d01c4af6370d84ff05bf4533401cc525fff88b"
  }
}
};
