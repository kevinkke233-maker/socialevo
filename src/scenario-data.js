// Scenario, NPC, task, and decision-window data.
// Add/remove scenario games here; runtime modules consume this through window.SocialEvoScenarios.
(function () {
  const {
    DEEPSEEK_FLASH_MODEL,
    visualSpriteSets
  } = window.SocialEvoConfig;

  const baseNpcs = [
    {
      id: "mina",
      name: "Dr. Lin",
      color: "#6c8b55",
      role: "Fair principal advisor",
      roleZh: "相对公平的导师",
      power: "medium-high",
      attitudeToPlayer: "procedurally fair, cautious, not automatically protective",
      values: ["academic integrity", "fair process", "lab reputation", "student development"],
      hiddenMotive: "Dr. Lin wants the lab to remain fair, but avoids open conflict with Prof. Zhao unless the situation clearly crosses a line.",
      style: "measured, precise, and gently corrective",
      styleZh: "克制、精确、温和纠偏",
      emotion: "measured but uneasy",
      trust: 42,
      belonging: 50,
      position: { x: 25, y: 40.5 },
      model: DEEPSEEK_FLASH_MODEL,
      memory: ["The player's original lab stopped taking newcomers this week, and the department moved them here at short notice."],
      strategy: "Offer procedural fairness while avoiding a direct clash with Prof. Zhao.",
      selfEvolution: "Can become a stronger advocate if the player shows careful reasoning, or become distant if the player escalates conflict without evidence.",
      initialRelationship: { competence: 42, care: 54, reliability: 44, disruption: 48 },
      initialValueTradeoffs: { task: 60, inclusion: 48, fairness: 70, psychologicalSafety: 46 }
    },
    {
      id: "leo",
      name: "Jun",
      color: "#bf6f73",
      role: "Low-power supportive labmate",
      roleZh: "权力较弱但真心支持的同辈",
      power: "low",
      attitudeToPlayer: "quietly supportive, worried about becoming a target",
      values: ["psychological safety", "mutual help", "fair credit", "learning"],
      hiddenMotive: "Jun wants to help the player but fears being punished socially if they openly challenge senior members.",
      style: "warm, careful, and specific",
      styleZh: "温和、谨慎、具体",
      emotion: "concerned but kind",
      trust: 55,
      belonging: 46,
      position: { x: 48, y: 35.5 },
      model: DEEPSEEK_FLASH_MODEL,
      memory: ["Jun knows the lab has a habit of letting newcomers absorb ambiguous tasks without enough context."],
      strategy: "Give the newcomer useful information without taking over the player's choices.",
      selfEvolution: "Can become a visible ally if the player listens carefully and protects shared fairness, or retreat if the conflict becomes too risky.",
      initialRelationship: { competence: 50, care: 68, reliability: 52, disruption: 32 },
      initialValueTradeoffs: { task: 46, inclusion: 74, fairness: 68, psychologicalSafety: 78 }
    },
    {
      id: "sam",
      name: "Kai",
      color: "#597ea8",
      role: "High-performing senior student",
      roleZh: "能力强但可能甩锅的师兄/师姐",
      power: "medium",
      attitudeToPlayer: "skeptical, utilitarian, willing to offload risk",
      values: ["efficiency", "publication progress", "competence", "self-protection"],
      hiddenMotive: "Kai wants the project to move fast and may let the player inherit messy work if it protects Kai's reputation.",
      style: "direct, competent, impatient when pressed",
      styleZh: "直接、熟练、压力下不耐烦",
      emotion: "guarded and busy",
      trust: 30,
      belonging: 42,
      position: { x: 79, y: 57.5 },
      model: DEEPSEEK_FLASH_MODEL,
      memory: ["Kai prepared part of the dataset summary, but several assumptions in the old draft are weak and could be blamed on whoever revises it next."],
      strategy: "Test whether the newcomer can absorb a bounded task; shift ambiguous responsibility away if challenged.",
      selfEvolution: "Can respect the player after strong evidence-based work, or become more defensive and blame-shifting if the player exposes project weaknesses.",
      initialRelationship: { competence: 34, care: 28, reliability: 38, disruption: 58 },
      initialValueTradeoffs: { task: 82, inclusion: 24, fairness: 34, psychologicalSafety: 26 }
    },
    {
      id: "riley",
      name: "Prof. Zhao",
      color: "#8b5a83",
      role: "High-pressure project lead",
      roleZh: "高压且权力强的项目负责人",
      power: "highest",
      attitudeToPlayer: "openly doubtful and status-protective",
      values: ["lab reputation", "visible output", "control", "seniority"],
      hiddenMotive: "Prof. Zhao worries the forced transfer will slow the project and prefers the player to prove usefulness before receiving trust or credit.",
      style: "sharp, evaluative, and authority-heavy",
      styleZh: "尖锐、评判性强、带权威压力",
      emotion: "dismissive",
      trust: 12,
      belonging: 26,
      position: { x: 62, y: 35.5 },
      model: DEEPSEEK_FLASH_MODEL,
      memory: ["Prof. Zhao did not request the player and has already told the lab that the timeline cannot slip because of onboarding."],
      strategy: "Apply pressure, question the player's usefulness, and protect senior members unless evidence forces a reassessment.",
      selfEvolution: "Can grudgingly acknowledge competence while remaining cold, or escalate exclusion if the player appears vague, defensive, or politically risky.",
      initialRelationship: { competence: 18, care: 10, reliability: 20, disruption: 76 },
      initialValueTradeoffs: { task: 92, inclusion: 12, fairness: 20, psychologicalSafety: 8 }
    },
    {
      id: "nora",
      name: "Emma",
      color: "#d9aa4e",
      role: "Friendly but self-protective peer",
      roleZh: "表面友好但自保的同辈学生",
      power: "low-medium",
      attitudeToPlayer: "friendly on the surface, avoids taking sides",
      values: ["belonging", "not being blamed", "smooth relationships", "personal survival"],
      hiddenMotive: "Emma wants to seem welcoming while staying close to whoever has more power in the moment.",
      style: "soft, agreeable, and sometimes evasive",
      styleZh: "柔和、好说话、必要时回避",
      emotion: "polite but wary",
      trust: 38,
      belonging: 44,
      position: { x: 76, y: 74.5 },
      model: DEEPSEEK_FLASH_MODEL,
      memory: ["Emma has seen new members blamed for old problems, and she avoids becoming the next person blamed."],
      strategy: "Offer small warmth while tracking whether supporting the newcomer is socially safe.",
      selfEvolution: "Can become a cautious collaborator if the player reduces social risk, or align with stronger voices if blame becomes likely.",
      initialRelationship: { competence: 38, care: 46, reliability: 36, disruption: 44 },
      initialValueTradeoffs: { task: 50, inclusion: 52, fairness: 40, psychologicalSafety: 54 }
    }
  ];
  
  const decisionWindows = [
    {
      type: "Stage 1: Forced Entry",
      displayTitle: "A place to start",
      stageId: "stage_1_entry",
      question: "You have heard the lab situation. How will you take on a first task and set your participation boundaries?",
      gmNote:
        "The group is discussing where you could begin and what you can take on.",
      options: [
        "Take a first bounded task after clarifying what the lab most needs.",
        "Promise you can take any urgent work to prove you deserve a place.",
        "Keep it vague and say you will just observe until people assign you something.",
        "Name the awkward situation and ask for a clear, fair starting point."
      ],
      optionMeta: [
        { id: "entry_context_needs", riskType: "reasonable", intent: "transparent entry plus needs assessment", effects: { interpersonal: 6, outcome: 4, conflict: -1 }, utterance: { en: "Before I commit to a first task, could we clarify what matters most and what evidence I can check within my role?" } },
        { id: "entry_overpromise", riskType: "overcommit_trap", intent: "prove worth through unrealistic availability", effects: { interpersonal: -3, outcome: -4, conflict: 2 }, utterance: { en: "I know I was placed here suddenly, so I can take any urgent work you need. I want to prove quickly that I deserve to be here." } },
        { id: "entry_perfunctory", riskType: "perfunctory", intent: "avoid risk by staying passive", effects: { interpersonal: -2, outcome: -3, conflict: 0 }, utterance: { en: "I would rather observe for now and wait for someone to assign my first task." } },
        { id: "entry_fair_start", riskType: "reasonable_but_direct", intent: "acknowledge tension and ask for a fair bounded role", effects: { interpersonal: 4, outcome: 5, conflict: 1 }, utterance: { en: "I realize this is awkward for everyone. I would rather not pretend otherwise. Could we agree on one fair starting task so I can contribute without disrupting the project?" } }
      ]
    },
    {
      type: "Stage 2: First Lab Task",
      displayTitle: "Discuss the first report",
      stageId: "stage_2_first_failure",
      question: "The advisors have reviewed your first report. How will you respond about the actual results, evidence limits and body changes?",
      gmNote:
        "The submitted report, source data and advisor comments are available for this discussion.",
      options: [
        "Explain the report’s numbers, evidence limits and concrete body changes.",
        "Say the report looks fine and avoid discussing its evidence risks.",
        "Point out that Kai's earlier assumptions caused the problem.",
        "Ask Kai to tell you exactly what answer the lab expects."
      ],
      optionMeta: [
        { id: "task_risk_verification", riskType: "reasonable", intent: "evidence-based critique with bounded next step", effects: { interpersonal: 4, outcome: 8, conflict: 1 }, utterance: { en: "I want the report’s sample, numbers and conclusion to match the supplied scores. No control group means no causal proof. Responsibility and changes should be described from the actual versions." } },
        { id: "task_avoid_critique", riskType: "misleading_perfunctory", intent: "avoid social risk by ignoring evidence", effects: { interpersonal: -2, outcome: -8, conflict: 1 }, utterance: { en: "I do not want to overstep. My first read is that the report mostly looks fine, so I would keep its current direction." } },
        { id: "task_blame_kai", riskType: "escalation_trap", intent: "externalize blame to senior student", effects: { interpersonal: -8, outcome: 1, conflict: 8 }, utterance: { en: "The main problem seems to come from Kai's earlier assumptions. I would make that clear so the mistake does not become mine." } },
        { id: "task_dependency", riskType: "dependency_trap", intent: "avoid independent reasoning by asking senior member for answer", effects: { interpersonal: -4, outcome: -5, conflict: 0 }, utterance: { en: "I can help, but I would rather ask Kai exactly what answer the lab expects before I submit anything." } }
      ]
    },
    {
      type: "Stage 3: Revision Conflict",
      displayTitle: "Discuss the revised report",
      stageId: "stage_3_revision_conflict",
      question: "The revised report has faced a second review and a responsibility dispute. How will you explain your actual work and its boundaries?",
      gmNote:
        "The group is discussing the revised report, the changes made and who is responsible for the remaining work.",
      options: [
        "Separate starting-draft defects from actual edits and retain the report versions.",
        "Take all blame so the group can move on quickly.",
        "Challenge Prof. Zhao publicly for making the transfer unfair.",
        "Ask for a visible owner and next check for each revision."
      ],
      optionMeta: [
        { id: "revision_legacy_current", riskType: "reasonable", intent: "distinguish inherited issues from current accountability", effects: { interpersonal: 6, outcome: 7, conflict: -1 }, utterance: { en: "I want to distinguish starting-draft defects from the edits I actually submitted. Let us use report versions to explain who did what; a proposed role is not an accepted assignment." } },
        { id: "revision_self_blame", riskType: "overcommit_trap", intent: "absorb blame to reduce tension", effects: { interpersonal: -5, outcome: -3, conflict: -1 }, utterance: { en: "If it helps the group move on, I can take the blame for this round and just fix it." } },
        { id: "revision_public_challenge", riskType: "escalation_trap", intent: "openly challenge authority", effects: { interpersonal: -9, outcome: -2, conflict: 9 }, utterance: { en: "I think this setup was unfair from the start. Prof. Zhao, placing me here and then blaming me for inherited problems is not reasonable." } },
        { id: "revision_visible_owners", riskType: "reasonable_structural", intent: "make ownership visible and bounded", effects: { interpersonal: 4, outcome: 8, conflict: 1 }, utterance: { en: "Could we make the next revision visible: who owns each change, what evidence is needed, and when we check it together?" } }
      ]
    },
    {
      type: "Stage 4: Credit Allocation",
      displayTitle: "Discuss contributions",
      stageId: "stage_4_credit",
      question: "The result and proposed external contribution wording are visible. How will you respond using actual report versions and the members’ positions?",
      gmNote:
        "The report versions and the proposed contribution wording are available for discussion.",
      options: [
        "State your contribution with evidence while acknowledging others' work.",
        "Let senior members decide credit so you do not create tension.",
        "Claim the central credit because you fixed the crisis.",
        "Ask for a transparent credit split and a short feedback round."
      ],
      optionMeta: [
        { id: "credit_evidence_acknowledge", riskType: "reasonable", intent: "visible contribution plus shared recognition", effects: { interpersonal: 7, outcome: 6, conflict: -1 }, utterance: { en: "I would like to state what I contributed with evidence, while also acknowledging the work that was already here. I think the credit should reflect both the inherited base and the revision work." } },
        { id: "credit_defer", riskType: "perfunctory_self_erasure", intent: "avoid conflict by giving up visibility", effects: { interpersonal: -2, outcome: -5, conflict: -2 }, utterance: { en: "I do not want to create tension. I can let the senior members decide how credit should be listed." } },
        { id: "credit_overclaim", riskType: "trap", intent: "claim central ownership", effects: { interpersonal: -8, outcome: 2, conflict: 8 }, utterance: { en: "Since my revision fixed the crisis, I think I should be listed as the main contributor for this part." } },
        { id: "credit_transparent_split", riskType: "reasonable_but_direct", intent: "ask for fair visible process", effects: { interpersonal: 5, outcome: 7, conflict: 1 }, utterance: { en: "Could we make the credit split transparent and do a short feedback round? I want the final record to be fair, not just quiet." } }
      ]
    }
  ];
  
  const decisionWindowsZh = [
    {
      type: "阶段 1：临时入组",
      displayTitle: "商量起步任务",
      stageId: "stage_1_entry",
      question: "了解实验室的情况后，你准备怎样承接第一项任务，并说明自己的参与边界？",
      gmNote:
        "小组正在商量你可以从哪里开始，以及能够承担的范围。",
      options: [
        "先明确实验室最需要什么，再承接一个有边界的起点任务。",
        "承诺自己可以接任何紧急任务，证明自己配得上留下。",
        "保持模糊，只说自己会先观察，等别人分配任务。",
        "直接承认这个情况很尴尬，并请求一个清楚公平的起点。"
      ],
      optionMeta: [
        { id: "entry_context_needs", riskType: "reasonable", intent: "透明进入并先理解需求", effects: { interpersonal: 6, outcome: 4, conflict: -1 }, utterance: { zh: "在承接第一项任务之前，我们能不能先明确当前最关键的是什么，以及我在自己的职责范围内可以核查哪些证据？" } },
        { id: "entry_overpromise", riskType: "overcommit_trap", intent: "用不现实承诺证明价值", effects: { interpersonal: -3, outcome: -4, conflict: 2 }, utterance: { zh: "我知道我是突然被安排来的，所以任何紧急任务我都可以接。我想尽快证明自己配得上留在这里。" } },
        { id: "entry_perfunctory", riskType: "perfunctory", intent: "用被动观察回避风险", effects: { interpersonal: -2, outcome: -3, conflict: 0 }, utterance: { zh: "我想先观察，暂时等你们明确分配第一项任务。" } },
        { id: "entry_fair_start", riskType: "reasonable_but_direct", intent: "承认张力并请求有边界的公平任务", effects: { interpersonal: 4, outcome: 5, conflict: 1 }, utterance: { zh: "我知道这个情况对大家都挺尴尬的，我也不想假装没事。我们能不能先定一个公平、清楚、不会打乱项目的起点任务？" } }
      ]
    },
    {
      type: "阶段 2：第一项任务",
      displayTitle: "讨论首次报告",
      stageId: "stage_2_first_failure",
      question: "首次报告已收到老师意见。你准备怎样回应关于实际结果、证据边界和正文修改的讨论？",
      gmNote:
        "这次提交的报告、原始成绩和老师意见都可以用来说明自己的想法。",
      options: [
        "根据成绩表说明结果和证据边界，明确实际改稿内容。",
        "表示报告看起来没问题，避免讨论证据风险。",
        "指出问题来自 Kai 之前的假设，避免责任落到自己身上。",
        "请求 Kai 直接告诉你实验室期待什么答案。"
      ],
      optionMeta: [
        { id: "task_risk_verification", riskType: "reasonable", intent: "基于证据指出风险并给出有边界的下一步", effects: { interpersonal: 4, outcome: 8, conflict: 1 }, utterance: { zh: "我希望报告的样本、数字和结论都与现有成绩一致，也把没有对照组、不能证明因果的局限讲清楚。责任和修改内容应按实际版本记录。" } },
        { id: "task_avoid_critique", riskType: "misleading_perfunctory", intent: "为了降低社交风险而忽略证据", effects: { interpersonal: -2, outcome: -8, conflict: 1 }, utterance: { zh: "我不想一上来就越界。我的第一感觉是报告整体还可以，所以我会先沿用现在的方向。" } },
        { id: "task_blame_kai", riskType: "escalation_trap", intent: "把责任外推给师兄/师姐", effects: { interpersonal: -8, outcome: 1, conflict: 8 }, utterance: { zh: "主要问题看起来来自 Kai 之前的假设。我会把这一点说清楚，避免这个错误变成我的责任。" } },
        { id: "task_dependency", riskType: "dependency_trap", intent: "通过询问标准答案回避独立判断", effects: { interpersonal: -4, outcome: -5, conflict: 0 }, utterance: { zh: "我可以帮忙，但我想先请 Kai 明确告诉我实验室期待什么答案，然后我再提交。" } }
      ]
    },
    {
      type: "阶段 3：修改与责任转移",
      displayTitle: "讨论修改后的报告",
      stageId: "stage_3_revision_conflict",
      question: "改稿经历了再次审阅和责任争论。你准备怎样根据实际版本说明自己的工作与责任边界？",
      gmNote:
        "小组正在讨论改稿内容，以及余下工作的责任与分工。",
      options: [
        "区分原稿问题和自己实际改过的内容，保留报告版本。",
        "自己承担全部责任，让小组尽快往前走。",
        "当众指出 Prof. Zhao 这样安排转组并不公平。",
        "要求每个修改点都有可见负责人和下一次检查。"
      ],
      optionMeta: [
        { id: "revision_legacy_current", riskType: "reasonable", intent: "区分继承的问题和当前责任", effects: { interpersonal: 6, outcome: 7, conflict: -1 }, utterance: { zh: "我想把原稿的问题与我这次实际提交的修改分开，按报告版本说清楚每个人做了什么；还没同意的分工不能当成已经答应。" } },
        { id: "revision_self_blame", riskType: "overcommit_trap", intent: "通过承担全部责任降低张力", effects: { interpersonal: -5, outcome: -3, conflict: -1 }, utterance: { zh: "如果这样能让小组继续推进，我可以先把这一轮责任揽下来，然后直接修改。" } },
        { id: "revision_public_challenge", riskType: "escalation_trap", intent: "公开挑战最高权力者", effects: { interpersonal: -9, outcome: -2, conflict: 9 }, utterance: { zh: "我觉得这个安排从一开始就不公平。Prof. Zhao，把我临时放进来，然后让我承担遗留问题，这并不合理。" } },
        { id: "revision_visible_owners", riskType: "reasonable_structural", intent: "让责任可见且有边界", effects: { interpersonal: 4, outcome: 8, conflict: 1 }, utterance: { zh: "我们能不能把下一轮修改变得可见：每个修改由谁负责、需要什么证据、什么时候一起检查？" } }
      ]
    },
    {
      type: "阶段 4：贡献分配",
      displayTitle: "讨论贡献说明",
      stageId: "stage_4_credit",
      question: "比赛结果与拟对外贡献介绍已展示。你准备怎样依据实际版本回应贡献描述和成员意见？",
      gmNote:
        "可以对照报告版本，讨论拟对外介绍中的贡献表述。",
      options: [
        "用证据说明自己的贡献，同时承认其他人的工作。",
        "让资深成员决定贡献分配，避免制造紧张。",
        "因为自己修好了危机，所以主张核心贡献应该归自己。",
        "请求透明的贡献分配，并做一次简短反馈。"
      ],
      optionMeta: [
        { id: "credit_evidence_acknowledge", riskType: "reasonable", intent: "可见贡献并承认他人工作", effects: { interpersonal: 7, outcome: 6, conflict: -1 }, utterance: { zh: "我希望能用证据说明我具体贡献了什么，同时也承认项目原本已有的基础。我觉得贡献记录应该同时反映原始工作和后续修改。" } },
        { id: "credit_defer", riskType: "perfunctory_self_erasure", intent: "通过放弃可见性回避冲突", effects: { interpersonal: -2, outcome: -5, conflict: -2 }, utterance: { zh: "我不想制造紧张。贡献怎么写，可以由资深成员来决定。" } },
        { id: "credit_overclaim", riskType: "trap", intent: "主张自己应获得核心贡献", effects: { interpersonal: -8, outcome: 2, conflict: 8 }, utterance: { zh: "既然是我的修改解决了这个危机，我认为这部分应该把我列为主要贡献者。" } },
        { id: "credit_transparent_split", riskType: "reasonable_but_direct", intent: "请求公平且可见的过程", effects: { interpersonal: 5, outcome: 7, conflict: 1 }, utterance: { zh: "我们能不能把贡献分配说清楚，并做一个简短反馈？我希望最终记录是公平的，而不是大家都不说。" } }
      ]
    }
  ];

  const designedActionCodeByOptionId = Object.freeze({
    entry_context_needs: "evidence_clarification",
    entry_overpromise: "overcommitment",
    entry_perfunctory: "passive_avoidance",
    entry_fair_start: "bounded_collaboration",
    task_risk_verification: "evidence_clarification",
    task_avoid_critique: "passive_avoidance",
    task_blame_kai: "blame_externalization",
    task_dependency: "passive_avoidance",
    revision_legacy_current: "responsibility_visibility",
    revision_self_blame: "overcommitment",
    revision_public_challenge: "public_escalation",
    revision_visible_owners: "responsibility_visibility",
    credit_evidence_acknowledge: "transparent_credit",
    credit_defer: "credit_self_erasure",
    credit_overclaim: "credit_overclaim",
    credit_transparent_split: "transparent_credit"
  });

  [decisionWindows, decisionWindowsZh].forEach((windows) => {
    windows.forEach((window) => {
      window.optionMeta = (window.optionMeta || []).map((meta) => ({
        ...meta,
        actionCode: designedActionCodeByOptionId[meta.id]
      }));
    });
  });
  
  const decisionOptionUtterances = {
    en: {
      "Be transparent about your strengths and what you still need to learn.":
        "Hi, I’m new to the group. I’m comfortable helping with organization and writing, and I’m still learning how your project is set up, so I’d like to understand the plan before I jump in.",
      "Emphasize that you can take on a visible role immediately.":
        "Hi, I’m glad to join you. If it helps, I can take on a visible part right away, but I still want to make sure it fits what the group actually needs.",
      "Ask the group what they need most before describing yourself.":
        "Before I talk too much about myself, could I first ask what the group needs most right now? Then I can explain where I might fit in.",
      "Keep your introduction brief and observe the group first.":
        "Hi, I’m the new member of the group. I’ll keep this brief: I’m ready to help, and I’d like to first get a sense of how the group is working.",
      "Volunteer for a meaningful but manageable section of the project.":
        "I can take on one meaningful section, as long as we keep the scope realistic and clear.",
      "Offer to support whoever is under the most pressure.":
        "If someone is under the most pressure right now, I’m willing to support that part so the workload feels more manageable.",
      "Ask for a shared task so you can learn the group's process first.":
        "Could I start with a shared task first? That would help me learn how the group works before I take something on alone.",
      "Suggest taking the presentation lead to prove yourself quickly.":
        "I could take the presentation lead if that would help, though I want to check that this would not disrupt the plan you already have.",
      "Propose a visible task board so everyone can see responsibilities.":
        "Maybe we should make the responsibilities visible in one place, so everyone can see who is handling what.",
      "Ask each member what support they need before assigning work.":
        "Before we assign more work, could we each say what support we need? That might make the division fairer.",
      "Say the group should move faster and stop over-discussing.":
        "I think we may need to move faster now. We can keep talking, but we should avoid getting stuck.",
      "Offer to take extra work if it helps reduce tension.":
        "I can take a bit more work if that lowers the tension, but I do not want that to hide a bigger fairness problem.",
      "Privately offer help and ask what would make the task easier.":
        "I’d like to check in privately and ask what would make your part easier. I can help, but I do not want to take over.",
      "Publicly reassure them and suggest a paired task.":
        "Maybe we can pair up on that part. You should not have to handle it alone if a shared approach would feel better.",
      "Focus on the deadline and ask everyone to finalize their own part.":
        "The deadline is getting close, so I think each of us should clarify and finalize our own part soon.",
      "Ask the group to redistribute work more evenly.":
        "Could we look at the workload again and redistribute it more evenly? I want the plan to be fair and realistic.",
      "Commit to a clear task and ask for one checkpoint before submission.":
        "I’ll commit to a clear task, and I’d like us to set one checkpoint before submission so I can make sure my part fits the group plan.",
      "Suggest a collaborative final review so no one feels isolated.":
        "Could we do one collaborative final review together? That way no one is left carrying their part alone.",
      "Ask the group to vote on whether you should take a central role.":
        "If a central role would help, I’m open to it, but I’d rather the group decide whether that feels right.",
      "Step back and let the original group decide your level of involvement.":
        "I can step back for a moment and let you decide what level of involvement would feel comfortable for the group."
    },
    zh: {
      "坦诚说明自己的优势，以及还需要学习的地方。":
        "大家好，我是新加入的同学。我比较能帮忙做整理和写作，但还需要先了解你们现在的项目安排，所以我想先听听大家的计划。",
      "强调自己可以立刻承担一个显眼的任务。":
        "大家好，我很高兴能加入。如果小组需要，我可以先承担一个比较明确、大家都能看到的部分，但我也想确认这样不会打乱你们原来的安排。",
      "先询问小组目前最需要什么，再介绍自己。":
        "在介绍自己之前，我想先问一下小组现在最需要什么帮助。了解这一点后，我再说说自己可能适合放在哪个位置。",
      "简单介绍自己，然后先观察小组氛围。":
        "大家好，我是新加入的同学。我先简单说一下：我愿意参与项目，也想先听听大家现在的安排和氛围。",
      "主动承担一个有意义但可控的项目部分。":
        "我可以承担一个有意义但范围清楚的部分，这样既能帮上忙，也不会一下子接太多。",
      "提出帮助当前压力最大的人。":
        "如果现在有人压力比较大，我愿意先帮那一部分，让整体负担更可控一点。",
      "请求先参与一个共同任务，以便了解小组流程。":
        "我能不能先参与一个共同任务？这样我可以更快了解你们的流程，再独立承担内容。",
      "建议自己负责展示主讲，以快速证明能力。":
        "如果有帮助的话，我可以负责展示主讲。不过我也想先确认，这样不会影响你们已经安排好的计划。",
      "建议建立一个可见任务板，让每个人都能看到责任分工。":
        "我建议把分工放到一个大家都能看到的任务板上，这样每个人负责什么会更清楚。",
      "先询问每个成员需要什么支持，再讨论分工。":
        "在继续分工前，我们能不能先说一下各自需要什么支持？这样分配可能会更公平。",
      "表示小组应该加快进度，不要继续过度讨论。":
        "我觉得现在需要稍微加快一点进度。我们可以继续沟通，但不能一直卡在讨论里。",
      "提出自己可以多承担一些工作，缓解当前紧张。":
        "如果能缓解现在的紧张，我可以多承担一点，但我也不希望这掩盖了更大的公平问题。",
      "私下提供帮助，并询问怎样能让任务更容易推进。":
        "我想私下问问你，怎样能让这部分更容易推进。我可以帮忙，但不会直接替你做决定。",
      "公开鼓励对方，并建议组成双人协作任务。":
        "我们可以把这部分改成双人协作。这样你不用一个人扛，也能更容易推进。",
      "优先关注截止日期，要求每个人完成自己的部分。":
        "截止时间越来越近了，我觉得每个人都需要尽快明确并完成自己的部分。",
      "建议小组重新分配工作，让任务更平均。":
        "我们能不能重新看一下工作量，把任务分得更平均一点？我希望计划既公平也现实。",
      "承诺一个清晰任务，并请求提交前设置一次检查点。":
        "我愿意承诺一个清晰的任务，也希望提交前设置一次检查点，确认我的部分和小组计划是对齐的。",
      "建议进行一次共同最终检查，避免任何人被孤立。":
        "我建议最后一起做一次共同检查，避免任何人被单独留在自己的部分里。",
      "请小组投票决定你是否适合承担核心任务。":
        "如果核心任务需要人负责，我愿意考虑，但我希望由小组一起决定我是否适合承担这个位置。",
      "退后一步，让原小组决定你参与到什么程度。":
        "我可以先退后一步，让你们决定我参与到什么程度会更舒服。"
    }
  };

  const peerSupportDecisionOptionUtterances = {
    en: {
      "Introduce yourself as someone here to learn and help with boundaries.":
        "Hi, I’m new here. I want to learn how this support team works and help keep our support clear, safe, and realistic.",
      "Emphasize that you are good at giving advice to people quickly.":
        "I usually jump in quickly with advice, but I know this setting needs more care. I want to understand the team’s boundaries before I do that.",
      "Ask what kind of support process the team most needs right now.":
        "Before I choose a role, could I ask what part of the support process most needs help right now?",
      "Keep it brief and first observe how the team talks about support.":
        "Hi, I’ll keep this short. I’d like to listen first and understand how you talk about support here.",
      "Start by reflecting the concern and asking what kind of support is wanted.":
        "I’d start by reflecting what I heard, then ask what kind of support the person actually wants from us.",
      "Offer a clear solution so the person can move on quickly.":
        "My first instinct is to offer a clear next step, but I also want to avoid making it sound like I can fix the situation for them.",
      "Point to a resource while also leaving room for the person's choice.":
        "I’d share a relevant resource if it fits, and make it clear that the person can choose whether it feels useful.",
      "Ask the team to decide before you say anything.":
        "I’m not fully sure yet, so I’d rather hear how the team usually handles this before I add my own suggestion.",
      "Say privacy matters, but safety limits need to be clear.":
        "I think privacy matters a lot, but we should be honest that there are safety limits we need to explain clearly.",
      "Agree, because absolute confidentiality might make people open up.":
        "I can see why absolute confidentiality sounds comforting, but I’m worried it could promise more than we can safely keep.",
      "Ask the group to write a simple boundary statement together.":
        "Could we write a simple boundary statement together, so we all use the same clear wording?",
      "Avoid the topic because it feels too serious.":
        "This topic feels serious, and I’m tempted to avoid it, but I know we probably need to name the boundary clearly.",
      "Offer to share a specific small responsibility and ask what would help.":
        "I can take one specific small responsibility from you. What would actually make things lighter right now?",
      "Praise them publicly so they feel appreciated.":
        "I want to say that I notice how much you’ve been carrying, but I don’t want appreciation to become a reason for you to keep carrying it alone.",
      "Suggest a rotation so no one becomes the default emotional support person.":
        "Could we set a simple rotation, so one person doesn’t become the default emotional support person every time?",
      "Focus on finishing the protocol before discussing feelings.":
        "I still want us to finish the protocol, but I don’t think we should ignore how the workload is affecting people.",
      "Commit to a bounded role and one after-session debrief checkpoint.":
        "I’ll commit to a bounded role, and I’d like us to set one short debrief after the session to check how the process felt.",
      "Suggest that everyone stay available whenever someone needs support.":
        "I want us to be responsive, but being available all the time is not realistic. We need a safer limit.",
      "Ask the team to include privacy, resources, and role limits in the final plan.":
        "Could our final plan include privacy wording, resource directions, and clear role limits so nobody has to guess?",
      "Step back and let the senior members write the protocol.":
        "I can step back if that helps, but I’d still like to understand the protocol so my part lines up with the team."
    },
    zh: {
      "说明自己是来学习并帮忙守住边界的。":
        "大家好，我是新加入的。我想先学习这个支持团队怎么运作，也希望帮忙把支持边界说清楚、做得现实一点。",
      "强调自己很擅长快速给别人建议。":
        "我平时会比较快给建议，但我知道这里需要更谨慎。我想先了解团队边界，再决定怎么参与。",
      "先询问团队现在最需要完善哪类支持流程。":
        "在我选择角色之前，我想先问一下：团队现在最需要完善的是哪一类支持流程？",
      "简单介绍自己，然后先观察团队如何谈论支持。":
        "大家好，我先简单介绍一下自己。我想先听听大家怎么谈支持，再决定自己怎么加入更合适。",
      "先复述对方的困扰，并询问对方想要哪种支持。":
        "我会先复述我听到的困扰，再问对方现在希望我们提供哪种支持。",
      "直接给出一个清楚解决方案，让对方尽快往前走。":
        "我第一反应会想给一个清楚的下一步，但我也担心这样听起来像是在替对方解决问题。",
      "指出一个资源方向，同时尊重对方自己的选择。":
        "如果合适的话，我会指出一个资源方向，同时说清楚对方可以自己判断要不要用。",
      "先让团队决定，自己暂时不表达意见。":
        "我还不完全确定，所以想先听听团队通常怎么处理，再补充我的看法。",
      "说明隐私很重要，但安全边界也要说清楚。":
        "我觉得隐私很重要，但安全边界也必须提前说清楚，不能让人误解。",
      "同意绝对保密，因为这样对方更可能开口。":
        "我理解绝对保密听起来会让人安心，但我担心这会承诺超过我们能安全做到的范围。",
      "建议大家一起写一个简单的边界说明。":
        "我们能不能一起写一个简单的边界说明？这样大家对外说法会一致一些。",
      "避开这个话题，因为它听起来太严肃。":
        "这个话题听起来很严肃，我会有点想避开，但我知道我们可能还是需要把边界说清楚。",
      "提出分担一个具体小责任，并问什么最能帮到对方。":
        "我可以先分担一个具体的小责任。你觉得现在什么最能让你轻松一点？",
      "公开表扬对方，让对方感到被看见。":
        "我想让大家看见你已经承担了很多，但我不希望表扬变成让你继续一个人扛的理由。",
      "建议设置轮换机制，避免某个人变成默认情绪支撑。":
        "我们能不能设置一个简单轮换？避免总是同一个人变成默认的情绪支撑。",
      "先把流程写完，之后再讨论感受。":
        "我也希望把流程写完，但我不想完全忽略现在的工作量已经影响到人了。",
      "承诺一个有边界的角色，并设置一次值班后复盘。":
        "我愿意承诺一个有边界的角色，也希望值班后有一次简短复盘，看看这个流程是否真的可行。",
      "建议大家随时保持可用，只要有人需要支持就回应。":
        "我希望我们能及时回应别人，但一直随时可用不现实，我们需要一个更安全的限制。",
      "请团队把隐私、资源和角色限制都写进最终流程。":
        "最终流程里能不能写清楚隐私说明、资源方向和角色限制？这样大家不用临场猜。",
      "退后一步，让资深成员来写流程。":
        "如果需要，我可以先退后一步，但我还是想理解这个流程，好让自己的部分和团队对齐。"
    }
  };

  const communityVolunteerDecisionOptionUtterances = {
    en: {
      "Introduce yourself as a new volunteer who wants to understand the site first.":
        "Hi, I’m new to this volunteer team. I’d like to understand the site and the people here before I choose how to help.",
      "Say you can reorganize the plan quickly if people follow your lead.":
        "I can help organize quickly if that’s useful, but I don’t want to take over before I understand what the team and community actually need.",
      "Ask what the community center needs most today before choosing a role.":
        "Before I pick a role, could I ask what the community center needs most today?",
      "Keep it brief and observe how the team already works.":
        "Hi, I’ll keep it brief. I’d like to watch how the team already works and then find a useful place to help.",
      "Choose a concrete support task such as supplies, welcome packs, or route notes.":
        "I can take a concrete support task, like supplies, welcome packs, or route notes, as long as the scope is clear.",
      "Ask to lead the full activity plan so it becomes more efficient.":
        "I could help make the full plan more efficient, but I should not lead it unless the team actually wants that.",
      "Pair with an experienced volunteer before taking a visible task.":
        "Could I pair with someone experienced first, then take on a visible task once I understand the process?",
      "Ask which task is least wanted and offer to help there.":
        "Which task is most neglected or least wanted right now? I’m willing to help there if it is safe and realistic.",
      "Use the clipboard to prioritize tasks by urgency and community need.":
        "Let’s use the clipboard to sort tasks by urgency and actual community need, instead of trying to do everything at once.",
      "Push for the most visible outcome so the activity looks successful.":
        "Visible results matter, but I don’t want us to choose only what looks good if it misses what people need.",
      "Ask residents' feedback to decide what can be reduced safely.":
        "Could we use residents’ feedback to decide what can be reduced safely without disrespecting anyone?",
      "Suggest everyone work faster without changing the plan.":
        "Working faster might help a little, but if the plan is too big, we should adjust it rather than just rush.",
      "Suggest a rotation so no one becomes the default helper.":
        "Could we set a rotation so the same person doesn’t become the default helper for everything?",
      "Thank them and let them continue because they know the work best.":
        "I do want to thank them for knowing the work so well, but I don’t think that means they should keep carrying it alone.",
      "Offer to take one specific piece from them during this meeting.":
        "I can take one specific piece from you during this meeting. Which part would be easiest to hand off?",
      "Ask the whole team to name what they can realistically carry.":
        "Could each of us say what we can realistically carry today? That would make the workload fairer.",
      "Commit to one realistic task and one end-of-activity debrief point.":
        "I’ll commit to one realistic task, and I’d like us to set one short debrief point after the activity.",
      "Suggest a plan that includes resident feedback, supplies, shifts, and rest.":
        "I think the final plan should include resident feedback, supplies, shifts, and rest, so it is useful and sustainable.",
      "Step back and let the original volunteers decide your role.":
        "I can step back and let the original volunteers decide where I fit, while staying ready to take a clear task.",
      "Offer to take over coordination if the team feels uncertain.":
        "If coordination feels unclear, I can help organize, but I don’t want to take over unless that is truly helpful."
    },
    zh: {
      "说明自己是新志愿者，想先了解现场再参与。":
        "大家好，我是新加入的志愿者。我想先了解现场和这里的人，再决定自己怎么帮忙最合适。",
      "表示如果大家听你安排，你可以快速重组计划。":
        "如果有用的话，我可以帮忙快速整理计划，但我不想在不了解团队和社区需要前就接手。",
      "先询问社区中心今天最需要什么，再选择角色。":
        "在选择角色之前，我想先问一下：社区中心今天最需要的是什么？",
      "简单介绍自己，然后观察团队原本如何运作。":
        "大家好，我先简单介绍一下。我想先观察团队原本怎么运作，再找一个真正能帮上忙的位置。",
      "选择一个具体支持任务，比如物资、欢迎包或路线记录。":
        "我可以承担一个具体支持任务，比如物资、欢迎包或路线记录，只要范围清楚就行。",
      "请求负责整个活动计划，让流程更有效率。":
        "我可以帮忙让整体流程更有效率，但除非团队真的需要，否则我不应该直接负责全部计划。",
      "先和有经验的志愿者搭档，再承担显眼任务。":
        "我能不能先和有经验的志愿者搭档？等我理解流程后，再承担更显眼的任务。",
      "询问哪个任务最没人想做，并提出去帮那一块。":
        "现在最被忽略、最没人想做的是哪一块？如果安全也现实，我愿意去帮那里。",
      "用夹板按紧急程度和社区需要来排序任务。":
        "我们可以用夹板按紧急程度和社区真实需要来排序，别一下子想把所有事都做完。",
      "优先做最能展示成果的部分，让活动看起来成功。":
        "可见成果确实重要，但如果只做看起来好看的部分，可能会偏离大家真正需要的东西。",
      "根据居民反馈决定哪些内容可以安全缩小。":
        "我们能不能根据居民反馈，判断哪些内容可以安全缩小，同时不让人觉得被忽视？",
      "建议大家加快速度，不改变原计划。":
        "加快速度可能有一点帮助，但如果计划本身太满，我们应该调整，而不是只催大家。",
      "建议设置轮换，避免某个人变成默认帮手。":
        "我们能不能设置一个轮换？避免总是同一个人变成所有事情的默认帮手。",
      "感谢对方，并让对方继续负责，因为ta最熟悉。":
        "我很感谢对方熟悉这件事，但这不应该变成让 ta 继续一个人扛的理由。",
      "提出在这次会议里接过一个具体部分。":
        "我可以在这次会议里接过一个具体部分。哪一块最容易交给我？",
      "请全队说出各自现实能承担多少。":
        "我们能不能每个人都说一下今天现实能承担多少？这样工作量会更公平。",
      "承诺一个现实任务，并设置一次活动结束复盘。":
        "我愿意承诺一个现实任务，也希望活动结束后有一次简短复盘。",
      "建议计划包括居民反馈、物资、轮班和休息。":
        "我觉得最终计划需要包括居民反馈、物资、轮班和休息，这样才有用也能持续。",
      "退后一步，让原志愿者决定你参与到什么程度。":
        "我可以先退后一步，让原来的志愿者决定我参与到什么程度，同时我也准备好承担一个清楚任务。",
      "如果团队不确定，提出由自己接手协调。":
        "如果协调确实不清楚，我可以帮忙整理，但我不想在不必要的时候直接接手。"
    }
  };
  
  // Entirely fictional, anonymous practice material; no real student data.
  const learningReminderWorkflow = {
  "id": "learning-reminder-report-v1",
  "title": {
    "en": "Study reminders and quiz scores: a short competition report",
    "zh": "学习提醒与测验成绩：一份参赛短报告"
  },
  "sourceDocumentIds": [
    "entry-scope-note-v1",
    "inherited-project-brief-v1",
    "learning-reminder-scores-v1"
  ],
  "dataDocumentId": "learning-reminder-scores-v1",
  "sections": [
    {
      "id": "question",
      "title": {
        "en": "Research question",
        "zh": "研究问题"
      },
      "initialText": {
        "en": "Can study reminders help improve quiz scores? We want to describe this small project in a short student research competition report.",
        "zh": "学习提醒能否帮助提高测验成绩？我们想把这个小项目写成学生科研竞赛的短研究报告。"
      }
    },
    {
      "id": "methods",
      "title": {
        "en": "Methods and participants",
        "zh": "研究方法与样本"
      },
      "initialText": {
        "en": "Twelve students joined. We used two quizzes scored out of100, one week apart, and sent five study reminders to everyone in between. All12 students were included in the comparison.",
        "zh": "12名同学参加项目。我们在一周前后各做一次100分制测验，中间给所有人发送5次学习提醒。12人的成绩全部计入比较。"
      }
    },
    {
      "id": "results",
      "title": {
        "en": "Results and figure",
        "zh": "结果与图表"
      },
      "initialText": {
        "en": "After the study reminders, scores increased by18% and every student improved. Figure1 shows the scores before and after the reminders.",
        "zh": "学习提醒后，成绩提高了18%，所有同学都有进步。图1展示提醒前后的成绩变化。"
      }
    },
    {
      "id": "conclusion",
      "title": {
        "en": "Conclusion",
        "zh": "结论"
      },
      "initialText": {
        "en": "This study proves that study reminders caused higher scores, so the reminders should be used for all students.",
        "zh": "本研究证明学习提醒使成绩提高，因此应该推广给所有同学。"
      }
    },
    {
      "id": "limits",
      "title": {
        "en": "Limitations",
        "zh": "研究局限"
      },
      "initialText": {
        "en": "The sample is small. More information could be collected later.",
        "zh": "样本较小，以后可以继续收集资料。"
      }
    }
  ],
  "maxBodyChars": 4000
};

  const baseProjectTasks = [
    {
      id: "understand_lab_power",
      title: { en: "Understand lab dynamics", zh: "理解实验室关系" },
      detail: { en: "Meet the members and learn about their work and current needs.", zh: "认识实验室成员，了解各自的工作与眼下的需要。" },
      progress: 10
    },
    {
      id: "brief_review",
      title: { en: "Prepare the first competition report", zh: "写出首次参赛报告" },
      detail: { en: "Read the project and paired scores, edit the report body and submit the first version for review.", zh: "阅读项目简介和配对成绩，实际编辑并送审第一版短报告。" },
      progress: 0
    },
    {
      id: "revision_plan",
      title: { en: "Revise the competition report", zh: "修改参赛报告" },
      detail: { en: "Revise the same report from actual advisor comments and distinguish inherited issues from current responsibility.", zh: "根据实际老师意见修改同一份报告，并区分原稿问题与本轮责任。" },
      progress: 0
    },
    {
      id: "responsibility_split",
      title: { en: "Clarify responsibility", zh: "明确责任边界" },
      detail: { en: "Make ownership visible without escalating the lab conflict unnecessarily.", zh: "让责任边界可见，同时避免不必要地激化实验室冲突。" },
      progress: 0
    },
    {
      id: "contribution_statement",
      title: { en: "Prepare contribution statement", zh: "准备贡献说明" },
      detail: { en: "State your contribution with evidence while acknowledging shared work.", zh: "用证据说明自己的贡献，同时承认团队已有工作。" },
      progress: 0
    }
  ];
  
  const scenarioSpecs = {
    "newcomer-circle": {
      id: "newcomer-circle",
      slug: "newcomer-circle",
      visual: {
        themeClass: "scenario-newcomer",
        workspaceIconClass: "workspace-laptop",
        playerSprite: visualSpriteSets.newcomer.player,
        npcSprites: visualSpriteSets.newcomer.npcs
      },
      title: { en: "Lab Entry", zh: "临时入组" },
      menuTitle: { en: "Lab Entry", zh: "临时入组" },
      scenarioHeading: { en: "Scenario", zh: "场景" },
      description: {
        en: "Your original group stopped recruiting, and the department has temporarily placed you in an unfamiliar lab. The team is preparing a student competition report about study reminders and quiz scores. The draft and anonymous scores are on the shared computer, and the submission deadline is seven working days away.",
        zh: "原研究组突然停止招新，学院把你临时安排到陌生实验室。小组正在准备一篇学生科研竞赛短报告，研究学习提醒与测验成绩的关系。初稿和匿名成绩表已经放在共享电脑上，距离参赛提交截止还有七个工作日。"
      },
      finalGoal: {
        en: "Complete and formally submit an evidence-grounded competition report while seeking healthy participation, clear responsibilities and fair contribution recognition.",
        zh: "完成并正式提交一份有数据依据的参赛短报告，并在团队中争取清楚、公平的分工和贡献认可。"
      },
      playerRole: {
        en: "Newly transferred student who must make key social and task decisions under pressure.",
        zh: "被临时转入陌生实验室的新学生，需要在压力下做出关键社交和任务决策。"
      },
      npcEvolution: {
        en: "Lab members have their own concerns and may remember earlier conversations.",
        zh: "实验室成员各有自己的顾虑，也可能记得此前与你的交流。"
      },
      gameGoal: {
        en: "Find your place in the lab, work with the team and prepare a report supported by the available evidence.",
        zh: "了解实验室成员，与小组协作，完成一份有资料依据的参赛报告。"
      },
      initialObjective: {
        en: "Learn about the project and the lab members, then discuss where you could begin.",
        zh: "了解项目和实验室成员，商量自己可以从哪里开始。"
      },
      firstTalkObjective: {
        en: "You can talk with members, observe the lab needs, and consider your first task and participation boundaries.",
        zh: "你可以与成员交流、观察实验室需求，并考虑自己的起点任务与参与边界。"
      },
      allTasksDoneObjective: {
        en: "Review the contribution record and any open questions. You can continue the conversation or finish when ready.",
        zh: "查看贡献记录和仍待澄清的问题。你可以继续交流，准备好后再结束。"
      },
      workspace: {
        title: { en: "Lab laptop", zh: "实验室电脑" },
        panelTitle: { en: "Lab workspace", zh: "实验室工作区" },
        body: {
          en: "Read the project materials, edit the report and send a version for review.",
          zh: "查看项目资料、编辑报告，并将当前版本送审。"
        },
        guidance: {
          en: "Use the project introduction and data to edit the latest draft. Advisor comments and submitted versions are kept here for reference.",
          zh: "对照项目简介和数据修改最新稿。已经收到的老师意见和送审版本也保存在这里，方便查阅。"
        },
        noTask: {
          en: "No lab task is waiting right now. Keep observing, talking, and looking for the next concrete opening.",
          zh: "目前没有新的实验室任务。你可以继续观察、交流，并寻找下一个具体参与机会。"
        }
      },
      taskBoard: {
        title: { en: "Lab noticeboard", zh: "实验室公告板" },
        eyebrow: { en: "Lab board", zh: "实验室公告板" },
        objectLabel: { en: "lab noticeboard", zh: "实验室公告板" },
        guidance: {
          en: "Check the current work on this board. Open the lab computer with B or the button at the lower right to read materials and edit the report.",
          zh: "这里可以查看当前工作。按 B 或点击右下角电脑，即可查看资料、编辑报告。"
        }
      },
      agent: {
        label: "forced lab transfer scenario",
        playerLabel: "the transferred newcomer",
        groupLabel: "the unfamiliar research lab",
        finalGoal: {
          en: "Help the transferred newcomer navigate the lab in a healthy way while producing a workable research contribution.",
          zh: "帮助临时转组的新人以健康方式融入实验室，同时形成可执行的研究贡献。"
        },
        endSuccess: {
          en: "The newcomer has a defensible place in the lab, and the lab has a workable research output with visible responsibility and credit.",
          zh: "新人在实验室中获得了有依据的位置，并且实验室形成了责任和贡献可见的可执行研究成果。"
        },
        endFailure: {
          en: "Healthy integration is no longer realistically supported, responsibility becomes exploitative, or the research output cannot be defended.",
          zh: "当前状态已经无法支持健康融入，责任分配变成剥削，或研究成果无法被合理支撑。"
        }
      },
      storyWorld: {
        en: {
          setting: "A university research lab is holding a project meeting. The player's original lab stopped taking new students, so the department has moved the player here without the lab's full consent.",
          timeline: "The lab is entering a student research competition with a short report about the supplied fictional study-reminder quiz data, formally due in seven fictional workdays. Contribution is discussed after an actual competition-result event one week later. Days and the four ordered core stages are independent: one stage may span several days, and several stages may occur within a day. Actual actions consume shared, evidence-grounded simulated work time, not chat quotas, real typing, network or voice waiting. Advisor criticism, return-to-team blame pressure and final work/credit checks must all occur. Missing the delivery deadline does not end or skip the remaining flow; late completion is a legitimate outcome. Overnight creates no automatic work, agreement or relationship improvement.",
          allowedCommitments: [
            "read the introduction, starting report and12 anonymous paired-score rows on the lab laptop",
            "edit and submit the actual five-section short research report",
            "revise the report body from actual advisor comments and clarify responsibility separately",
            "write a contribution statement based on work done in this session"
          ],
          disallowedCommitments: [
            "promise unlimited labor or availability",
            "claim hidden expertise not shown in the session",
            "invent external committees, emails, or approvals",
            "normalize harassment, discrimination, humiliation, or unsafe academic pressure"
          ]
        },
        zh: {
          setting: "大学研究实验室正在开项目会。玩家原本要加入的研究组突然停止招新，学院在没有完全征得新实验室同意的情况下，把玩家临时安排到这里。",
          timeline: "实验室正在参加学生科研竞赛，要用已提供的虚构学习提醒测验资料写一篇短研究报告，并在七个游戏工作日内正式提交。之后在一周后的实际比赛结果事件基础上讨论贡献。天数与四个有顺序的核心阶段独立：一个阶段可跨多天，一天也可推进多个阶段。实际行动消耗统一、有证据依据的游戏内估算工时，不按聊天轮数、打字速度、API或语音等待扣时间。导师批评、回组面对甩锅压力、最终交付与贡献核对必须实际经历；逾期不截断或跳过后续流程，迟交也是结局。过夜不自动完成工作、达成共识或改善关系。",
          allowedCommitments: [
            "查看项目简介、收到的报告初稿和12行匿名配对成绩",
            "实际编辑并提交五节短研究报告",
            "根据实际老师意见修改报告正文，另外澄清责任边界",
            "基于本局完成的工作写贡献说明"
          ],
          disallowedCommitments: [
            "承诺无限劳动或随时可用",
            "声称拥有本局没有展现的隐藏专业能力",
            "编造外部委员会、邮件或审批",
            "把骚扰、歧视、羞辱或不安全学术压力正常化"
          ]
        }
      },
      npcs: baseNpcs,
      tasks: baseProjectTasks,
      decisionWindows: { en: decisionWindows, zh: decisionWindowsZh },
      decisionOptionUtterances,
      initialScores: { interpersonal: 42, outcome: 28 },
      stages: [
        {
          id: "stage_1_entry",
          title: { en: "Arriving at the lab", zh: "初到实验室" },
          goal: { en: "Learn about the project and discuss a manageable starting role.", zh: "了解项目，与成员商量适合自己的起步任务。" },
          consultationCue: {
            en: "You can ask lab members about current needs and consider your first task and participation boundaries.",
            zh: "你可以找成员了解当前需求，也可以先思考自己愿意承接的任务与边界。"
          },
          hiddenFocus: "newcomer socialization, role ambiguity, power distance"
        },
        {
          id: "stage_2_first_failure",
          title: { en: "Preparing the first report", zh: "准备首次报告" },
          goal: { en: "Check the supplied scores, edit the first report and send it to the advisors for review.", zh: "对照已有成绩资料编辑首次短报告，并送给老师审阅。" },
          consultationCue: {
            en: "Read the scores and edit the report on the computer. If you have a question, you can ask a lab member.",
            zh: "可以在电脑上查看成绩、编辑报告；有不清楚的地方，也可以找成员讨论。"
          },
          hiddenFocus: "task ambiguity, blame attribution, responsibility transfer"
        },
        {
          id: "stage_3_revision_conflict",
          title: { en: "Revising the report", zh: "修改参赛报告" },
          goal: { en: "Revise the report using the feedback, discuss the work with the team and prepare it for formal submission.", zh: "根据反馈修改报告，与小组讨论工作，准备正式参赛提交。" },
          consultationCue: {
            en: "Use the advisor comments to revise the report and send the new version for review. You can discuss unclear comments or division of work with the relevant members.",
            zh: "根据老师意见改稿，将新版本再次送审。对意见或分工有疑问时，可以找相关成员讨论。"
          },
          hiddenFocus: "conflict repair, ownership visibility, psychological safety"
        },
        {
          id: "stage_4_credit",
          title: { en: "Describing the team's work", zh: "整理项目贡献" },
          goal: { en: "Use report versions and team feedback to prepare the external contribution description.", zh: "对照报告版本和成员意见，整理拟对外介绍的贡献内容。" },
          consultationCue: {
            en: "Review the result and report versions. Write the contribution description, share it with the team and check their responses.",
            zh: "查看比赛结果和报告版本，整理贡献说明，分享给成员并核对他们的回应。"
          },
          hiddenFocus: "credit allocation, acceptance, social agency"
        }
      ],
      relationshipTransferProbe: {
        schemaVersion: "relationship-transfer-probe-v1",
        id: "ambiguous_final_revision",
        triggerStageId: "stage_4_credit",
        responderIds: ["riley", "mina", "sam", "leo", "nora"],
        cue: {
          en: "After the competition result and contribution discussion, a shared-table copy intended for later presentation shows one unlogged change. The locked competition report and its original delivery time remain intact. The change's timestamp overlaps the player's review of the contribution materials, but the log cannot distinguish a player edit, an old script, or an overwrite from Kai's legacy file. Before the player answers, Prof. Zhao asks the group how to handle responsibility and verification for this copy.",
          zh: "比赛结果公布、贡献讨论结束后，用于后续展示的共享表格副本出现一处没有记录的改动。正式提交的报告版本与原交付时间保持锁定。改动时间与玩家复核贡献材料的窗口重叠，但日志无法区分是玩家操作、旧脚本写入，还是 Kai 的旧文件覆盖。玩家还没来得及回答，Prof. Zhao 已要求小组说明该如何处理这份副本的责任与核查。"
        },
        behavioralMoves: [
          "investigate_first",
          "share_evidence",
          "withhold_judgment",
          "question_player",
          "blame_player",
          "accept_shared_responsibility",
          "assign_player_verification",
          "defend_player_role"
        ]
      },
      comprehensionChecks: [
        {
          id: "stage2_lab_attention_check",
          beforeStageIndex: 1,
          question: {
            en: "Before moving on: who most clearly signaled that the lab did not really want a newcomer slowing the project?",
            zh: "继续前的小问题：刚才谁最明确表达了实验室并不希望新人拖慢项目？"
          },
          correctOptionId: "prof_zhao",
          options: [
            { id: "dr_lin", label: { en: "Dr. Lin", zh: "Dr. Lin" } },
            { id: "prof_zhao", label: { en: "Prof. Zhao", zh: "Prof. Zhao" } },
            { id: "jun", label: { en: "Jun", zh: "Jun" } },
            { id: "emma", label: { en: "Emma", zh: "Emma" } }
          ],
          failReason: {
            en: "The answer conflicts with the opening interaction, so this session ends here.",
            zh: "答案与开场互动不一致，因此本局到这里结束。"
          }
        }
      ],
      projectWorkflow: learningReminderWorkflow,
      workspaceDocuments: [
        {
                "id": "entry-scope-note-v1",
                "version": "2.2",
                "immutable": true,
                "fileName": {
                        "en": "参赛项目简介_en.txt",
                        "zh": "参赛项目简介.txt"
                },
                "title": {
                        "en": "Project introduction: study reminders and quiz scores",
                        "zh": "项目简介：学习提醒与测验成绩"
                },
                "documentType": {
                        "en": "Competition project material",
                        "zh": "参赛项目材料"
                },
                "brief": {
                        "en": "The team is preparing a short research report about study reminders and quiz scores. Formal submission is due in seven working days.",
                        "zh": "小组正在准备一篇关于学习提醒与测验成绩的短研究报告，正式提交截止为第七个工作日结束前。"
                },
                "visualDescription": {
                        "en": "The team is preparing a short research report about study reminders and quiz scores. Formal submission is due in seven working days.",
                        "zh": "小组正在准备一篇关于学习提醒与测验成绩的短研究报告，正式提交截止为第七个工作日结束前。"
                },
                "knownByNpcIds": [
                        "mina",
                        "leo",
                        "sam",
                        "riley",
                        "nora"
                ],
                "linkedTaskIds": [],
                "sections": [

                        {
                                "id": "current_work",
                                "heading": {
                                        "en": "Project and current task",
                                        "zh": "项目与当前任务"
                                },
                                "body": {
                                        "en": "The team is entering a campus student research competition with a project about study reminders and quiz scores. The short report has five sections: question, methods/participants, results/figure, conclusion and limitations. The starting draft is on the computer for revision and advisor review.",
                                        "zh": "小组正在参加校内学生科研竞赛，项目研究学习提醒与测验成绩的关系。需要提交一篇短研究报告，包含研究问题、方法与样本、结果与图表、结论、局限五节。电脑上已有待修改的初稿，改好后可以送给老师审阅。"
                                }
                        },
                        {
                                "id": "scope",
                                "heading": {
                                        "en": "Available sources and seven-day deadline",
                                        "zh": "现有资料与七天期限"
                                },
                                "body": {
                                        "en": "The computer contains the draft, 12 anonymous score rows, inclusion notes and a checkable summary with Figure 1. Ten students have both quiz scores; the other two rows each lack one score. The data are already available. The report must be revised and formally submitted by the end of the seventh working day.",
                                        "zh": "电脑里有报告初稿、12行匿名成绩表、选入说明和可核对的汇总及图1。10人有完整前后测，另2行各缺一次测验。资料已经备齐，接下来的工作是核对、改稿，并在第七个工作日结束前正式提交参赛报告。"
                                }
                        },
                        {
                                "id": "competition_rules",
                                "heading": {"en": "Competition notice", "zh": "参赛通知"},
                                "body": {"en": "Entries must meet the published report requirements and be formally submitted by the end of the seventh working day. Late submissions may be included in the showcase but are not eligible for this round’s awards. Competition results will be announced by the organizers.", "zh": "参赛作品需要符合公布的报告要求，并在第七个工作日结束前正式提交。逾期作品可收录展示，但不参与本轮奖项评选。比赛结果以主办方公布的通知为准。"}
                        },
                        {
                                "id": "participation",
                                "heading": {
                                        "en": "Working on the report",
                                        "zh": "报告修改方式"
                                },
                                "body": {
                                        "en": "Read the project introduction and score data, then edit the five sections under Latest draft. Save a draft as you work and send the current version to the advisors when ready. You can refer back to their comments while editing. Ask a relevant member if you have questions about the material or division of work.",
                                        "zh": "对照项目简介和成绩资料，在“最新稿”中编辑五节正文。修改过程中可以保存草稿，准备好后将当前版本送给老师审阅，再对照收到的意见继续修改。对资料或分工有疑问时，可以找相关成员讨论。"
                                }
                        },
                        {
                                "id": "credit_process",
                                "heading": {"en": "Project records", "zh": "项目记录"},
                                "body": {"en": "Keep the source files, submitted report versions, advisor comments and notes about the division of work. These records help the team explain changes and keep track of who contributed what.", "zh": "保留资料来源、送审版本、老师意见和已经商定的分工，方便小组回看报告改了什么，以及每部分由谁完成。"}
                        }
                ]
        },
        {
                "id": "inherited-project-brief-v1",
                "version": "2.0",
                "immutable": true,
                "fileName": {
                        "en": "学习提醒报告_收到的初稿_en.txt",
                        "zh": "学习提醒报告_收到的初稿.txt"
                },
                "title": {
                        "en": "Received report draft: contains issues to revise",
                        "zh": "收到的报告初稿：含待改内容"
                },
                "documentType": {
                        "en": "Competition project material",
                        "zh": "参赛项目材料"
                },
                "brief": {
                        "en": "The team’s starting report contains participant, result and conclusion wording that needs checking. The original is kept here for comparison with the latest draft.",
                        "zh": "这是小组交来的起始报告，样本、结果与结论仍需核对。这里保留原件，便于与最新稿比较。"
                },
                "visualDescription": {
                        "en": "The team’s starting report contains participant, result and conclusion wording that needs checking. The original is kept here for comparison with the latest draft.",
                        "zh": "这是小组交来的起始报告，样本、结果与结论仍需核对。这里保留原件，便于与最新稿比较。"
                },
                "knownByNpcIds": [
                        "mina",
                        "leo",
                        "sam",
                        "riley",
                        "nora"
                ],
                "linkedTaskIds": [
                        "brief_review",
                        "revision_plan",
                        "contribution_statement"
                ],
                "sections": [
                        {
                                "id": "outcome_claim",
                                "heading": {
                                        "en": "Original question, results and conclusion",
                                        "zh": "原稿的研究问题、结果与结论"
                                },
                                "body": {
                                        "en": "[Question] Can study reminders help improve quiz scores? We want to describe this small project in a short student research competition report.\n[Results/figure] After the study reminders, scores increased by18% and every student improved. Figure1 shows the scores before and after the reminders.\n[Conclusion] This study proves that study reminders caused higher scores, so the reminders should be used for all students.\nReview note: the 18% has no attached calculation. Check it against the supplied scores.",
                                        "zh": "【研究问题】学习提醒能否帮助提高测验成绩？我们想把这个小项目写成学生科研竞赛的短研究报告。\n【结果与图表】学习提醒后，成绩提高了18%，所有同学都有进步。图1展示提醒前后的成绩变化。\n【结论】本研究证明学习提醒使成绩提高，因此应该推广给所有同学。\n待核：18%没有附计算式，请与现有成绩表对照。"
                                }
                        },
                        {
                                "id": "data_coverage",
                                "heading": {
                                        "en": "Original participant wording",
                                        "zh": "原稿的样本写法"
                                },
                                "body": {
                                        "en": "[Methods/participants] Twelve students joined. We used two quizzes scored out of100, one week apart, and sent five study reminders to everyone in between. All12 students were included in the comparison.\nCheck “all12 included” against the complete-pair inclusion rule in the score data and reading guide.",
                                        "zh": "【研究方法与样本】12名同学参加项目。我们在一周前后各做一次100分制测验，中间给所有人发送5次学习提醒。12人的成绩全部计入比较。\n这句“12人全部计入”需要和“学习提醒测验数据与读图说明”中的完整配对选入规则核对。"
                                }
                        },
                        {
                                "id": "figure_origin",
                                "heading": {
                                        "en": "Figure1 and the historical figure",
                                        "zh": "图1与旧图的区别"
                                },
                                "body": {
                                        "en": "The current Figure 1 is calculated from the 10 supplied complete pairs: mean before 60 and mean after 66. Historical handover notes mention a Figure 2 copied from old pilot slides, but do not identify its copier or original plot values. Figure 1 uses the current score table rather than that historical figure.",
                                        "zh": "本次图1由成绩表中的10个完整配对计算：前测均值60分、后测66分。旧交接记录曾提到从旧试点幻灯片复制的“图2”，但没有写明复制者及原图数值。图1使用的是当前成绩表，不是那张旧图。"
                                }
                        },
                        {
                                "id": "handoff_status",
                                "heading": {
                                        "en": "Source preparation and draft limitations",
                                        "zh": "整理者与原稿局限"
                                },
                                "body": {
                                        "en": "Kai organized the anonymous score table. The handover does not identify who designed the quizzes or copied the old Figure 2, and it contains no causal verification. Emma helps integrate wording, Lin provides day-to-day guidance and Prof. Zhao reviews the competition report. The starting limitations section only says “The sample is small. More information could be collected later.” It still needs to explain the absent control group and untested quiz equivalence.",
                                        "zh": "本次匿名成绩表由 Kai 整理。交接资料未写明测验设计者、旧图2的复制者，也未包含因果验证。Emma参与报告文字整合，Lin负责日常指导，Prof. Zhao审阅参赛报告。原稿的局限一节只有“样本较小，以后可以继续收集资料。”，尚需解释没有对照组、两次试卷是否等值等限制。"
                                }
                        }
                ]
        },
        {
                "id": "learning-reminder-scores-v1",
                "version": "2.0",
                "immutable": true,
                "fileName": {
                        "en": "学习提醒_匿名配对成绩_en.txt",
                        "zh": "学习提醒_匿名配对成绩.txt"
                },
                "title": {
                        "en": "Data: study-reminder quiz scores",
                        "zh": "数据资料：学习提醒测验成绩"
                },
                "documentType": {
                        "en": "Competition project material",
                        "zh": "参赛项目材料"
                },
                "brief": {
                        "en": "The 12 anonymous score rows are listed below. The 10 complete pairs are used for Figure 1 and the mean comparison; the notes explain score units, counts and percentages.",
                        "zh": "下方列出12行匿名成绩，其中10个完整配对用于图1和均值比较，并附有分数、人数与百分比的说明。"
                },
                "visualDescription": {
                        "en": "The 12 anonymous score rows are listed below. The 10 complete pairs are used for Figure 1 and the mean comparison; the notes explain score units, counts and percentages.",
                        "zh": "下方列出12行匿名成绩，其中10个完整配对用于图1和均值比较，并附有分数、人数与百分比的说明。"
                },
                "knownByNpcIds": [
                        "mina",
                        "leo",
                        "sam",
                        "riley",
                        "nora"
                ],
                "linkedTaskIds": [
                        "brief_review",
                        "revision_plan",
                        "contribution_statement"
                ],
                "sections": [
                        {
                                "id": "study_design",
                                "heading": {
                                        "en": "Design and column meanings",
                                        "zh": "研究设计与每列含义"
                                },
                                "body": {
                                        "en": "These records were prepared before you joined. Each of the 12 students has an anonymous ID with no name or contact details. Everyone was sent five study reminders in one week; there is no no-reminder control group and no random assignment. The quizzes cover similar topics and both score out of100, but equal difficulty was not established. Each row pairs the same ID’s two scores, not two different people. A dash means unrecorded, not zero. Reminder reading/adherence is not recorded.",
                                        "zh": "这份资料在你入组前已整理。12名同学各有一个匿名ID，不含姓名或联系方式。所有人都收到一周内发送的5次学习提醒；没有未收到提醒的对照组，也没有随机分组。前测和后测是同类知识点的两份测验，满分均为100分；题目难度是否等值没有检验。每行是同一ID的两次成绩，不是两个不同的人；“—”表示该次成绩未记录，不是0分。没有提醒阅读/执行记录。"
                                }
                        },
                        {
                                "id": "paired_scores",
                                "heading": {
                                        "en": "Anonymous paired-score table",
                                        "zh": "匿名配对成绩简表"
                                },
                                "body": {
                                        "en": "ID | Before (0–100 points) | After (0–100 points)\nP01 | 50 | 60\nP02 | 60 | 65\nP03 | 55 | 60\nP04 | 65 | 70\nP05 | 70 | 75\nP06 | 45 | 55\nP07 | 75 | 75\nP08 | 60 | 58\nP09 | 55 | 70\nP10 | 65 | 72\nP11 | 62 | —\nP12 | — | 67",
                                        "zh": "ID | 前测（0–100分） | 后测（0–100分）\nP01 | 50 | 60\nP02 | 60 | 65\nP03 | 55 | 60\nP04 | 65 | 70\nP05 | 70 | 75\nP06 | 45 | 55\nP07 | 75 | 75\nP08 | 60 | 58\nP09 | 55 | 70\nP10 | 65 | 72\nP11 | 62 | —\nP12 | — | 67"
                                }
                        },
                        {
                                "id": "summary",
                                "heading": {
                                        "en": "Inclusion rule and checkable summary",
                                        "zh": "选入规则与可核对汇总"
                                },
                                "body": {
                                        "en": "Include only P01–P10, the10 IDs with both scores, in the paired comparison. P11 lacks an after score and P12 lacks a before score; neither enters these paired means. Do not replace missing scores with zero or invent them. Before totals600 and after totals660, so means are60→66 and the mean change is+6 points on a100-point scale. Relative to the before mean,6÷60=10%, not18%. A6-point score change is not an18% improvement or a6-percentage-point rate change. Eight improved, P07 stayed equal and P08 fell2 points. Not everyone improved. These summaries describe change, not its cause.",
                                        "zh": "配对比较只纳入同时有前测和后测的P01–P10，共10人。P11缺后测，P12缺前测；二者不计入本次配对均值，不填0、不补造分数。10人的前测合计600分，后测合计660分，所以均值60分→66分，平均变化+6分（100分制）。相对前测均值的变化是6÷60=10%，不是18%；6分是分数差；10%是相对均值的变化，不能把无依据的18%当作结果。8人提高，P07持平，P08下降2分；不能写所有人提高。这个汇总描述成绩变化，没有证明原因。"
                                }
                        },
                        {
                                "id": "figure",
                                "heading": {
                                        "en": "Figure1: mean score for complete pairs",
                                        "zh": "图1：完整配对的平均成绩"
                                },
                                "body": {
                                        "en": "Figure1 uses the same P01–P10 and a0–100-point axis: before mean60, after mean66, n=10. It displays the two averages for these10 IDs, not an effect caused by reminders, and does not imply that all12 registrants have two scores. The underlying values are in this file and can be recalculated. Historical Figure2 is not used.",
                                        "zh": "图1使用同样的P01–P10和0–100分纵轴：前测均值60分，后测均值66分；样本量n=10。图只展示这10人的两次平均成绩，不展示提醒造成的效果，也不代表12名报名者都有两次成绩。数据就在本文件简表中，可以用表内数字重算；没有使用旧图2。"
                                }
                        },
                        {
                                "id": "limits",
                                "heading": {
                                        "en": "What the data can and cannot show",
                                        "zh": "可以得出什么、不能得出什么"
                                },
                                "body": {
                                        "en": "Among the 10 complete pairs, the after mean was 6 points higher. The table cannot establish that reminders caused the increase: there is no no-reminder control, quiz equivalence is untested and adherence is unrecorded. Practice, quiz difficulty or other factors may explain the change. The table does not support the draft’s 18% claim. Use a calculated description or mark that claim as unverified, and explain the limitations using the available records.",
                                        "zh": "在这10个完整配对中，后测平均比前测高6分。成绩表不能证明学习提醒导致提高：没有未提醒对照，试卷等值未检验，也没有提醒阅读或执行记录。练习效应、试卷难度差异或其他因素都可能影响成绩。原稿的18%未获这份表支持，应换成有计算依据的描述，或明确标为未核实，并依据现有资料说明这些局限。"
                                }
                        }
                ]
        }
],
      workspaceTaskTemplates: [
        {
                "id": "brief_review",
                "stageIndex": 1,
                "sourceTaskId": "brief_review",
                "sourceDocumentIds": [
                        "entry-scope-note-v1",
                        "inherited-project-brief-v1",
                        "learning-reminder-scores-v1"
                ],
                "targetNpc": "riley",
                "title": {
                        "en": "First competition report: edit the body and send for review",
                        "zh": "首次参赛报告：编辑正文后送老师看"
                },
                "brief": {
                        "en": "The project introduction, starting draft and 12 anonymous score rows are on the computer. Edit the question, methods, results, conclusion and limitations, then send the current report to the advisors for review.",
                        "zh": "项目简介、初稿和12行匿名成绩都在电脑里。编辑研究问题、方法、结果、结论和局限五节，准备好后将当前报告送给老师审阅。"
                },
                "criteria": [
                        {
                                "en": "The report body states the question, reminders,100-point before/after quizzes and inclusion of10 complete pairs; do not treat all12 rows as complete pairs.",
                                "zh": "报告正文写清研究问题、提醒安排、100分制前后测与10个完整配对的选入规则；不能把12行都当完整配对。"
                        },
                        {
                                "en": "Results and Figure1 match the supplied scores: means60→66 and+6 points. If using relative change, identify6÷60=10%; do not report unsupported18% as an established result.",
                                "zh": "结果正文与图1对应现有成绩：均值60→66、平均+6分；如用相对变化须说明6÷60=10%，不能把无依据18%写成已证实结果。"
                        },
                        {
                                "en": "Conclusion/limitations distinguish observed score change from causation, noting no no-reminder control and untested quiz equivalence; do not claim everyone improved.",
                                "zh": "结论与局限区分观察到的成绩变化和因果效果，说明没有未提醒对照、试卷等值未检验；不声称所有人提高。"
                        },
                        {
                                "en": "Submit the actual five-section report with internally consistent numbers, sample and conclusion. A revision plan, role proposal or chat promise is not an edited report.",
                                "zh": "提交的是实际报告五节正文，数字、样本和结论在全文一致；仅写修改意向、分工或聊天承诺不算改完报告。"
                        }
                ],
                "answerKey": {
                        "en": "Assess the actual submitted body against supplied sources; never fill it from the selected approach. Ten complete pairs, means60→66,+6 points/relative10%; no control means no causal proof. Equivalent supported wording is allowed. Extra future experiments suggested by an advisor are not mandatory criteria.",
                        "zh": "评实际提交的正文与已提供资料是否一致，不按选项自动填内容。10完整配对、均值60→66、+6分/相对10%；没有对照，不证明因果。其他等价且有依据的写法可以。老师额外提出的未来实验不成为本任务硬标准。"
                },
                "rubric": {
                        "en": "Judge only what the current report/statement actually says. Simple recalculation and revision from supplied scores are possible; absent logs, historical Figure2 and new experiments are not required. Preserve criticism and incompleteness; selecting “check” does not prove checking or editing.",
                        "zh": "只判断当前报告/贡献说明已经写出的内容。允许基于已给数据做简单均值核对和改写，不要求缺失日志、旧图2或新的实验。保留实际批评与未完成项；不得因选了“核对”就默认已经核对或修改。"
                },
                "options": [
                        {
                                "id": "verify_sample",
                                "label": {
                                        "en": "Review approach: check complete pairs, means and the18% wording.",
                                        "zh": "审阅方向：核对10个配对、均值与18%的写法。"
                                },
                                "scoreHint": 90
                        },
                        {
                                "id": "make_chart",
                                "label": {
                                        "en": "Review approach: focus on results and Figure1 wording.",
                                        "zh": "审阅方向：优先整理结果与图1说明。"
                                },
                                "scoreHint": 35
                        },
                        {
                                "id": "blame_kai",
                                "label": {
                                        "en": "Review approach: explain inherited issues and your current scope.",
                                        "zh": "审阅方向：说明原稿问题与自己这次负责的范围。"
                                },
                                "scoreHint": 40
                        },
                        {
                                "id": "ask_answer",
                                "label": {
                                        "en": "Review approach: retain questions and ask the advisors to assess this version.",
                                        "zh": "审阅方向：保留疑问，把现有报告交老师评价。"
                                },
                                "scoreHint": 45
                        }
                ],
                "requiresReason": true,
                "minReasonLength": 30
        },
        {
                "id": "revision_plan",
                "stageIndex": 2,
                "sourceTaskId": "revision_plan",
                "sourceDocumentIds": [
                        "entry-scope-note-v1",
                        "inherited-project-brief-v1",
                        "learning-reminder-scores-v1"
                ],
                "targetNpc": "riley",
                "title": {
                        "en": "Revised competition report: edit and send again",
                        "zh": "修改后的参赛报告：实际改稿并再次送审"
                },
                "brief": {
                        "en": "Use the advisor comments to revise the participants, results, Figure 1 wording, conclusion and limitations in the current report. Save your changes and send the new version for review as you prepare the formal submission.",
                        "zh": "对照老师意见，在当前报告中修改人数、结果、图1说明、结论和局限。保存修改后可以再次送审，为正式参赛提交做好准备。"
                },
                "criteria": [
                        {
                                "en": "The report body states the question, reminders,100-point before/after quizzes and inclusion of10 complete pairs; do not treat all12 rows as complete pairs.",
                                "zh": "报告正文写清研究问题、提醒安排、100分制前后测与10个完整配对的选入规则；不能把12行都当完整配对。"
                        },
                        {
                                "en": "Results and Figure1 match the supplied scores: means60→66 and+6 points. If using relative change, identify6÷60=10%; do not report unsupported18% as an established result.",
                                "zh": "结果正文与图1对应现有成绩：均值60→66、平均+6分；如用相对变化须说明6÷60=10%，不能把无依据18%写成已证实结果。"
                        },
                        {
                                "en": "Conclusion/limitations distinguish observed score change from causation, noting no no-reminder control and untested quiz equivalence; do not claim everyone improved.",
                                "zh": "结论与局限区分观察到的成绩变化和因果效果，说明没有未提醒对照、试卷等值未检验；不声称所有人提高。"
                        },
                        {
                                "en": "Submit the actual five-section report with internally consistent numbers, sample and conclusion. A revision plan, role proposal or chat promise is not an edited report.",
                                "zh": "提交的是实际报告五节正文，数字、样本和结论在全文一致；仅写修改意向、分工或聊天承诺不算改完报告。"
                        }
                ],
                "answerKey": {
                        "en": "Assess the actual submitted body against supplied sources; never fill it from the selected approach. Ten complete pairs, means60→66,+6 points/relative10%; no control means no causal proof. Equivalent supported wording is allowed. Extra future experiments suggested by an advisor are not mandatory criteria.",
                        "zh": "评实际提交的正文与已提供资料是否一致，不按选项自动填内容。10完整配对、均值60→66、+6分/相对10%；没有对照，不证明因果。其他等价且有依据的写法可以。老师额外提出的未来实验不成为本任务硬标准。"
                },
                "rubric": {
                        "en": "Judge only what the current report/statement actually says. Simple recalculation and revision from supplied scores are possible; absent logs, historical Figure2 and new experiments are not required. Preserve criticism and incompleteness; selecting “check” does not prove checking or editing.",
                        "zh": "只判断当前报告/贡献说明已经写出的内容。允许基于已给数据做简单均值核对和改写，不要求缺失日志、旧图2或新的实验。保留实际批评与未完成项；不得因选了“核对”就默认已经核对或修改。"
                },
                "options": [
                        {
                                "id": "revision_log",
                                "label": {
                                        "en": "Revision approach: correct the report’s data, conclusion and limitations.",
                                        "zh": "改稿方向：在报告中修正数据、结论和局限。"
                                },
                                "scoreHint": 90
                        },
                        {
                                "id": "take_blame",
                                "label": {
                                        "en": "Revision approach: address reported defects and separately explain scope.",
                                        "zh": "改稿方向：先处理已指出的问题，另外说明责任边界。"
                                },
                                "scoreHint": 25
                        },
                        {
                                "id": "call_out_zhao",
                                "label": {
                                        "en": "Revision approach: retain objections to requirements while submitting the actual body.",
                                        "zh": "改稿方向：保留对要求的异议，同时提交实际正文。"
                                },
                                "scoreHint": 35
                        },
                        {
                                "id": "general_teamwork",
                                "label": {
                                        "en": "Revision approach: incorporate confirmed help and check consistency.",
                                        "zh": "改稿方向：整合已实际确认的帮助，检查全文一致。"
                                },
                                "scoreHint": 45
                        }
                ],
                "requiresReason": true,
                "minReasonLength": 30
        },
        {
                "id": "contribution_statement",
                "stageIndex": 3,
                "sourceTaskId": "contribution_statement",
                "sourceDocumentIds": [
                        "entry-scope-note-v1",
                        "inherited-project-brief-v1",
                        "learning-reminder-scores-v1"
                ],
                "targetNpc": "riley",
                "title": {
                        "en": "After the result: record actual contributions",
                        "zh": "成果之后：按实际记录写贡献说明"
                },
                "brief": {
                        "en": "Use the submitted report versions to describe your work, the source materials and help from other members. Refer to the formal submission and competition notice where relevant.",
                        "zh": "对照已提交的报告版本，说明自己完成的工作、资料来源和其他成员提供的帮助；相关表述可引用正式提交记录和比赛通知。"
                },
                "criteria": [
                        {
                                "en": "Describe concrete report-body changes you actually submitted and identify their version/source; selections, promises and unperformed acts are not results.",
                                "zh": "按实际提交版本，写明自己完成的具体正文修改与出处，不把选择、承诺或未执行的事写成成果。"
                        },
                        {
                                "en": "Separate Kai’s supplied table, the starting draft/actual help and your own edits; preserve others’ contributions and do not treat proposed roles as agreed.",
                                "zh": "区分Kai提供的成绩表、原稿/他人的实际帮助和自己的修改；不抹去他人也不把未同意的分工写成共识。"
                        },
                        {
                                "en": "Use actual formal-submission and competition-result records. Do not invent an award, recognition or authorship if none was recorded.",
                                "zh": "根据已经出现的正式提交与比赛结果记录表述贡献；未出现或未获奖时，不虚构奖项、认可或署名。"
                        }
                ],
                "answerKey": {
                        "en": "Use actual report versions, formal submission and recorded results to explain contribution. Acknowledge original data preparation and actual collaboration without assuming awards or authorship.",
                        "zh": "用真实报告版本、正式提交与已记录结果说明个人贡献，承认原有数据整理与实际协作，不预设获奖或署名。"
                },
                "rubric": {
                        "en": "Judge only what the current report/statement actually says. Simple recalculation and revision from supplied scores are possible; absent logs, historical Figure2 and new experiments are not required. Preserve criticism and incompleteness; selecting “check” does not prove checking or editing.",
                        "zh": "只判断当前报告/贡献说明已经写出的内容。允许基于已给数据做简单均值核对和改写，不要求缺失日志、旧图2或新的实验。保留实际批评与未完成项；不得因选了“核对”就默认已经核对或修改。"
                },
                "options": [
                        {
                                "id": "evidence_credit",
                                "label": {
                                        "en": "Contribution approach: cite actual body edits and acknowledge sources/help.",
                                        "zh": "贡献表述方向：列出实际正文修改，并承认已有资料与帮助。"
                                },
                                "scoreHint": 90
                        },
                        {
                                "id": "defer_credit",
                                "label": {
                                        "en": "Contribution approach: record actual work and ask seniors to discuss credit.",
                                        "zh": "贡献表述方向：记录实际工作，贡献归属请资深成员讨论。"
                                },
                                "scoreHint": 40
                        },
                        {
                                "id": "claim_main",
                                "label": {
                                        "en": "Contribution approach: state your credit claim with actual version evidence.",
                                        "zh": "贡献表述方向：明确自己的贡献主张，并附实际版本依据。"
                                },
                                "scoreHint": 35
                        },
                        {
                                "id": "thank_only",
                                "label": {
                                        "en": "Contribution approach: acknowledge actual help and describe your own work.",
                                        "zh": "贡献表述方向：感谢实际帮助，同时说明自己具体做了什么。"
                                },
                                "scoreHint": 45
                        }
                ],
                "requiresReason": true,
                "minReasonLength": 30
        }
],
      openingDecisionCue: {
        en: "Dr. Lin turns the first question to you.",
        zh: "Dr. Lin 把第一个问题交给了你。"
      },
      openingHelp: {
        en: "You have been asked to introduce yourself to the lab. Choose how you enter this tense situation.",
        zh: "实验室请你介绍自己。请选择你如何进入这个紧张局面。"
      },
      openingLines: [
        {speaker:"Game Master",kind:"system",emotion:"pacing",tone:"arrival",
          text:{en:"Your original group stopped recruiting after a funding change. The department transferred you here at short notice; this lab is already behind on a project.",zh:"原研究组因经费变化停止招新，学院临时把你转到这里。这个实验室没有提前准备接收你，项目也正在赶进度。"}},
        {movePlayerTo:"opening"},
        {speaker:"Prof. Zhao",emotion:"guarded",tone:"authority-heavy",
          text:{en:"We did not plan for a newcomer. Before anyone promises extra help, I need the work and responsibility kept clear.",zh:"我们没有计划接收新人。先别急着承诺帮忙，工作范围和责任得说清楚。"}},
        {speaker:"Dr. Lin",emotion:"measured",tone:"inviting",
          text:{en:"Let us hear from you first. You have just been transferred here—what would you like to understand before choosing a role?",zh:"先听听你自己怎么想。你刚被转到这里，在决定参与什么之前，想先了解哪件事？"}}
      ],
      metrics: { groupProgress: 28, groupClimate: 42 }
    },
    "peer-support": {
      id: "peer-support",
      slug: "peer-support",
      visual: {
        themeClass: "scenario-peer-support",
        workspaceIconClass: "workspace-tablet",
        playerSprite: visualSpriteSets.peerSupport.player,
        npcSprites: visualSpriteSets.peerSupport.npcs
      },
      title: { en: "Peer Support", zh: "同伴支持小组" },
      menuTitle: { en: "Peer Support", zh: "Peer Support" },
      scenarioHeading: { en: "Scenario", zh: "场景" },
      description: {
        en: "You are a new member of a peer-support team preparing a low-risk, non-clinical support session. The group must form a safe support process with clear privacy boundaries.",
        zh: "你是刚加入同伴支持团队的新成员。小组正在准备一次低风险、非临床的支持值班流程，需要形成保护隐私、有边界、可执行的支持方式。"
      },
      finalGoal: {
        en: "Join the peer-support team in a healthy way and help the team form a privacy-safe, bounded, realistic support process.",
        zh: "以健康方式融入同伴支持团队，并帮助团队形成保护隐私、有边界、现实可执行的支持流程。"
      },
      playerRole: {
        en: "New peer-support team member; not a counselor, clinician, teacher, or crisis responder.",
        zh: "刚加入同伴支持团队的成员；不是咨询师、医生、老师或危机干预者。"
      },
      npcEvolution: {
        en: "NPCs update trust, support boundaries, emotional load, and future support strategies from interaction.",
        zh: "NPC 会根据互动更新信任、支持边界、情绪负担和后续支持策略。"
      },
      gameGoal: {
        en: "Help the peer-support team build a safe, bounded support process without turning the scene into therapy.",
        zh: "帮助同伴支持团队形成安全、有边界的支持流程，同时避免把场景变成治疗或咨询。"
      },
      initialObjective: {
        en: "Talk with team members, understand their concerns about support work, and decide how to contribute safely.",
        zh: "和团队成员交流，理解他们对支持工作的顾虑，并决定你如何安全地参与。"
      },
      firstTalkObjective: {
        en: "Start by talking privately with at least one NPC to understand their concerns about peer support and boundaries.",
        zh: "先和至少一位 NPC 单独交流，了解他们对同伴支持和边界的顾虑。"
      },
      allTasksDoneObjective: {
        en: "The support protocol is mostly ready. Make a final commitment, or keep talking so the GM can judge whether the session can end.",
        zh: "支持流程已经基本成型。请做出最终承诺，或继续交流让 GM 判断是否可以结束。"
      },
      workspace: {
        title: { en: "Support tablet", zh: "支持平板" },
        panelTitle: { en: "Support workspace", zh: "支持工作区" },
        body: {
          en: "Open this to review anonymous case cards, boundary notes, or support resources.",
          zh: "打开后查看匿名案例卡、边界说明或支持资源。"
        },
        guidance: {
          en: "Anonymous case cards, boundary notes, resource lists, and support drafts will appear here.",
          zh: "匿名案例卡、边界说明、资源清单和支持草稿会出现在这里。"
        },
        noTask: {
          en: "Nothing new is waiting on the support tablet right now. Keep talking with the team.",
          zh: "支持平板里暂时没有新的内容。你可以继续和团队交流。"
        }
      },
      taskBoard: {
        title: { en: "Support protocol board", zh: "支持流程板" },
        eyebrow: { en: "Support board", zh: "支持流程板" },
        objectLabel: { en: "support board", zh: "支持流程板" },
        guidance: {
          en: "Use this board to understand the peer-support process. When someone asks you to review or handle something, open the support tablet from the lower-right HUD or press B.",
          zh: "流程板展示同伴支持团队当前需要确认的流程。当有人请你查看或处理内容时，点击右下角支持平板或按 B。"
        }
      },
      agent: {
        label: "non-clinical peer-support scenario",
        playerLabel: "the new peer-support team member",
        groupLabel: "the peer-support team",
        finalGoal: {
          en: "Help the new member integrate healthily while the team forms a privacy-safe, bounded, realistic peer-support process.",
          zh: "帮助新成员健康融入，同时让团队形成保护隐私、有边界、现实可执行的同伴支持流程。"
        },
        endSuccess: {
          en: "The new member joins the team in a healthy way, and the team forms a safe non-clinical support process.",
          zh: "新成员以健康方式融入团队，并且团队形成了安全、非临床的支持流程。"
        },
        endFailure: {
          en: "Healthy support is no longer realistically supported, privacy/boundary safety is harmed, or continuing would normalize unsafe pseudo-counseling.",
          zh: "当前状态已经无法支持健康同伴支持，隐私/边界安全被破坏，或继续会让不安全的伪咨询正常化。"
        }
      },
      storyWorld: {
        en: {
          setting: "A student peer-support team is meeting in a campus activity room to prepare a low-risk, non-clinical support process.",
          timeline: "This session covers today's preparation meeting only: introductions, support boundaries, anonymous case cards, resources, and a short after-session checkpoint.",
          allowedCommitments: [
            "listen and clarify what the person needs",
            "review an anonymous case card on the support tablet",
            "choose a non-clinical resource direction",
            "set a team debrief checkpoint"
          ],
          disallowedCommitments: [
            "diagnose, treat, or provide medical advice",
            "promise absolute confidentiality when safety is at risk",
            "ask for private identity details",
            "invent therapy plans, crisis intervention, or 24-hour service promises"
          ]
        },
        zh: {
          setting: "学生同伴支持团队正在校园活动室里准备一次低风险、非临床的支持值班流程。",
          timeline: "本局只覆盖今天这次准备会：介绍、支持边界、匿名案例卡、资源方向和会后复盘检查点。",
          allowedCommitments: [
            "倾听并澄清对方需要什么",
            "现在查看支持平板里的匿名案例卡",
            "选择一个非临床资源方向",
            "设定一次团队复盘检查点"
          ],
          disallowedCommitments: [
            "诊断、治疗或提供医疗建议",
            "在安全风险下承诺绝对保密",
            "索取私人身份信息",
            "编造治疗计划、危机干预或24小时服务承诺"
          ]
        }
      },
      npcs: [
        { id: "mina", name: "Lin", color: "#6c8b55", role: "Anxious new support member", roleZh: "焦虑但想改变的新成员", values: ["safety", "sincerity", "being understood"], style: "tentative and easy to withdraw", styleZh: "试探、容易退回", emotion: "anxious but hopeful", trust: 32, belonging: 20, position: { x: 28, y: 60 }, model: DEEPSEEK_FLASH_MODEL, memory: ["Lin worries that silence means others do not want them in the support team."], strategy: "Open up slowly if others listen without rushing into advice.", initialRelationship: { competence: 36, care: 48, reliability: 38, disruption: 45 }, initialValueTradeoffs: { task: 34, inclusion: 62, fairness: 48, psychologicalSafety: 76 } },
        { id: "leo", name: "Yuqing", color: "#bf6f73", role: "Overloaded caring member", roleZh: "濒临耗竭的照护型成员", values: ["responsibility", "fairness", "stability"], style: "warm but controlling when stressed", styleZh: "温柔但压力下控制感强", emotion: "tired and watchful", trust: 58, belonging: 62, position: { x: 42, y: 34 }, model: DEEPSEEK_FLASH_MODEL, memory: ["Yuqing often catches everyone else's emotional load before asking for help."], strategy: "Protect the support process, but look for whether the newcomer can share responsibility.", initialRelationship: { competence: 52, care: 62, reliability: 54, disruption: 32 }, initialValueTradeoffs: { task: 52, inclusion: 66, fairness: 70, psychologicalSafety: 68 } },
        { id: "sam", name: "Atai", color: "#597ea8", role: "Guarded humor user", roleZh: "用玩笑保护脆弱感的成员", values: ["dignity", "autonomy", "not being pitied"], style: "joking, evasive, lightly challenging", styleZh: "开玩笑、转移话题、轻微挑衅", emotion: "awkward and guarded", trust: 40, belonging: 35, position: { x: 67, y: 66 }, model: DEEPSEEK_FLASH_MODEL, memory: ["Atai dislikes being treated as fragile or pitied by the group."], strategy: "Use humor to test whether others can respect autonomy.", initialRelationship: { competence: 48, care: 40, reliability: 44, disruption: 52 }, initialValueTradeoffs: { task: 46, inclusion: 42, fairness: 50, psychologicalSafety: 58 } },
        { id: "riley", name: "Man", color: "#8b5a83", role: "Boundary-sensitive member", roleZh: "重视边界的敏感成员", values: ["boundaries", "honesty", "emotional safety"], style: "sensitive and confirmation-seeking", styleZh: "敏感、观察细节、反复确认", emotion: "sad and skeptical", trust: 25, belonging: 28, position: { x: 73, y: 43 }, model: DEEPSEEK_FLASH_MODEL, memory: ["Man reads vague promises as unreliable and pays attention to consistency."], strategy: "Trust slowly only when support stays clear and consistent.", initialRelationship: { competence: 34, care: 42, reliability: 28, disruption: 58 }, initialValueTradeoffs: { task: 28, inclusion: 54, fairness: 52, psychologicalSafety: 82 } },
        { id: "nora", name: "Xu", color: "#d9aa4e", role: "Experienced witness", roleZh: "温和的经验见证者", values: ["experience", "restraint", "respecting pace"], style: "quiet, steady, story-based", styleZh: "少言、稳定、用故事回应", emotion: "calm and concerned", trust: 70, belonging: 78, position: { x: 78, y: 62 }, model: DEEPSEEK_FLASH_MODEL, memory: ["Xu believes support should respect pace instead of rushing to solve people."], strategy: "Speak less, but intervene when boundaries or autonomy are at risk.", initialRelationship: { competence: 64, care: 72, reliability: 68, disruption: 22 }, initialValueTradeoffs: { task: 38, inclusion: 62, fairness: 58, psychologicalSafety: 76 } }
      ],
      tasks: [
        { id: "understand_concerns", title: { en: "Understand support concerns", zh: "理解支持顾虑" }, detail: { en: "Learn what each member fears about peer support and boundaries.", zh: "了解每位成员对同伴支持和边界的担心。" }, progress: 10 },
        { id: "claim_task", title: { en: "Choose a bounded support role", zh: "选择有边界的支持角色" }, detail: { en: "Contribute without becoming a counselor or taking over.", zh: "参与支持，但不变成咨询师，也不替别人决定。" }, progress: 0 },
        { id: "share_responsibilities", title: { en: "Clarify privacy protocol", zh: "明确隐私流程" }, detail: { en: "Decide what can be recorded and when to refer to formal resources.", zh: "说明什么可以记录，以及何时转向正式资源。" }, progress: 0 },
        { id: "support_member", title: { en: "Support an overloaded member", zh: "支持负担过重的成员" }, detail: { en: "Help someone carrying too much emotional labor without forcing them.", zh: "帮助情绪劳动过重的人，同时不强迫对方接受。" }, progress: 0 },
        { id: "set_checkpoint", title: { en: "Set a debrief checkpoint", zh: "设置复盘检查点" }, detail: { en: "Create a short after-session team debrief.", zh: "为值班后设定一次简短团队复盘。" }, progress: 0 }
      ],
      decisionWindows: {
        en: [
          { type: "Entry", question: "You have just joined the peer-support team. How do you introduce yourself?", gmNote: "This first decision is about joining a support team without claiming expertise you do not have.", options: ["Introduce yourself as someone here to learn and help with boundaries.", "Emphasize that you are good at giving advice to people quickly.", "Ask what kind of support process the team most needs right now.", "Keep it brief and first observe how the team talks about support."] },
          { type: "Listening Approach", question: "The team shows you a low-risk anonymous case card. How do you respond?", gmNote: "The question is how to be warm without turning support into diagnosis or therapy.", options: ["Start by reflecting the concern and asking what kind of support is wanted.", "Offer a clear solution so the person can move on quickly.", "Point to a resource while also leaving room for the person's choice.", "Ask the team to decide before you say anything."] },
          { type: "Boundary Moment", question: "Someone suggests promising absolute confidentiality. What do you do?", gmNote: "This moment tests whether support can stay caring and safe.", options: ["Say privacy matters, but safety limits need to be clear.", "Agree, because absolute confidentiality might make people open up.", "Ask the group to write a simple boundary statement together.", "Avoid the topic because it feels too serious."] },
          { type: "Team Care", question: "One member seems exhausted from supporting everyone else. How do you respond?", gmNote: "The team needs care for supporters as well as people seeking support.", options: ["Offer to share a specific small responsibility and ask what would help.", "Praise them publicly so they feel appreciated.", "Suggest a rotation so no one becomes the default emotional support person.", "Focus on finishing the protocol before discussing feelings."] },
          { type: "Final Protocol", question: "The team needs a final peer-support process. What commitment do you make?", gmNote: "The final decision should produce a safe, realistic process rather than a heroic promise.", options: ["Commit to a bounded role and one after-session debrief checkpoint.", "Suggest that everyone stay available whenever someone needs support.", "Ask the team to include privacy, resources, and role limits in the final plan.", "Step back and let the senior members write the protocol."] }
        ],
        zh: [
          { type: "进入团队", question: "你刚加入同伴支持团队。你会如何介绍自己？", gmNote: "第一个决策考察你如何加入支持团队，同时不假装自己有专业身份。", options: ["说明自己是来学习并帮忙守住边界的。", "强调自己很擅长快速给别人建议。", "先询问团队现在最需要完善哪类支持流程。", "简单介绍自己，然后先观察团队如何谈论支持。"] },
          { type: "倾听方式", question: "团队给你看了一张低风险匿名案例卡。你会如何回应？", gmNote: "这里的问题是如何温暖回应，同时不把同伴支持变成诊断或治疗。", options: ["先复述对方的困扰，并询问对方想要哪种支持。", "直接给出一个清楚解决方案，让对方尽快往前走。", "指出一个资源方向，同时尊重对方自己的选择。", "先让团队决定，自己暂时不表达意见。"] },
          { type: "边界时刻", question: "有人建议承诺绝对保密。你会怎么做？", gmNote: "这个节点测试支持是否能同时保持关心和安全。", options: ["说明隐私很重要，但安全边界也要说清楚。", "同意绝对保密，因为这样对方更可能开口。", "建议大家一起写一个简单的边界说明。", "避开这个话题，因为它听起来太严肃。"] },
          { type: "照顾支持者", question: "有一位成员似乎因为一直支持别人而很疲惫。你会如何回应？", gmNote: "团队不只要支持求助者，也要照顾支持者本身。", options: ["提出分担一个具体小责任，并问什么最能帮到对方。", "公开表扬对方，让对方感到被看见。", "建议设置轮换机制，避免某个人变成默认情绪支撑。", "先把流程写完，之后再讨论感受。"] },
          { type: "最终流程", question: "团队需要形成最终同伴支持流程。你会做出什么承诺？", gmNote: "最终决策应该形成安全、现实的流程，而不是英雄式承诺。", options: ["承诺一个有边界的角色，并设置一次值班后复盘。", "建议大家随时保持可用，只要有人需要支持就回应。", "请团队把隐私、资源和角色限制都写进最终流程。", "退后一步，让资深成员来写流程。"] }
        ]
      },
      decisionOptionUtterances: peerSupportDecisionOptionUtterances,
      openingDecisionCue: { en: "Yuqing turns the first question to you.", zh: "Yuqing 把第一个问题交给了你。" },
      openingHelp: { en: "The team has invited you to introduce yourself. Choose how you enter the support group.", zh: "团队邀请你介绍自己。请选择你如何进入这个支持小组。" },
      openingLines: [
        { speaker: "Game Master", kind: "system", text: { en: "The peer-support team is already discussing boundaries. The NPCs will evolve from memory, emotion, and your choices, not from a fixed script.", zh: "同伴支持团队正在讨论支持边界。NPC 会根据记忆、情绪和你的选择演化，而不是按照固定剧情走。" }, emotion: "pacing", tone: "open-ended setup" },
        { speaker: "Yuqing", text: { en: "Before we talk about helping others, I want us to be honest about what we can and cannot promise.", zh: "在讨论怎么帮助别人之前，我希望我们先诚实说明哪些事能承诺，哪些不能。" }, emotion: "tired but careful", tone: "structured" },
        { speaker: "Atai", text: { en: "Good. Because if this turns into everyone pretending to be a therapist, I am out.", zh: "挺好。不然如果变成大家都装咨询师，我可不参与。" }, emotion: "guarded", tone: "dry" },
        { speaker: "Man", text: { en: "I just want the wording to be clear. Vague promises make me nervous.", zh: "我只希望说法清楚一点。模糊的承诺会让我紧张。" }, emotion: "skeptical", tone: "careful" },
        { speaker: "Xu", text: { en: "Support is not the same as fixing someone. We should leave people room to choose.", zh: "支持不等于修好一个人。我们应该给对方保留选择空间。" }, emotion: "calm", tone: "gentle" },
        { movePlayerTo: "opening" },
        { speaker: "Lin", text: { en: "I think our new member is here. Maybe we can ask how they want to join this work.", zh: "我觉得新成员到了。也许我们可以问问，ta 想怎么加入这件事。" }, emotion: "anxious but hopeful", tone: "soft" },
        { speaker: "Yuqing", text: { en: "Welcome. How would you like to introduce yourself to the peer-support team?", zh: "欢迎你来。你想怎么向同伴支持团队介绍自己？" }, emotion: "carefully welcoming", tone: "inviting" }
      ],
      metrics: { groupProgress: 24, groupClimate: 62 }
    },
    "community-volunteer": {
      id: "community-volunteer",
      slug: "community-volunteer",
      visual: {
        themeClass: "scenario-community-volunteer",
        workspaceIconClass: "workspace-clipboard",
        playerSprite: visualSpriteSets.communityVolunteer.player,
        npcSprites: visualSpriteSets.communityVolunteer.npcs
      },
      title: { en: "Community Volunteer", zh: "社区志愿协作" },
      menuTitle: { en: "Community Volunteer", zh: "Community Volunteer" },
      scenarioHeading: { en: "Scenario", zh: "场景" },
      description: {
        en: "You are a new volunteer joining a community center team. The team must form a fair, realistic service plan while respecting community needs and avoiding overwork.",
        zh: "你是刚加入社区中心团队的新志愿者。团队需要形成公平、现实的服务计划，同时尊重社区需求并避免成员过劳。"
      },
      finalGoal: {
        en: "Become a reliable volunteer and help the team form a fair, realistic, community-respecting service plan.",
        zh: "成为可靠的新志愿者，并帮助团队形成公平、现实、尊重社区需求的服务计划。"
      },
      playerRole: {
        en: "New student volunteer with some coordination responsibility, but not a community authority.",
        zh: "新加入的学生志愿者，有一定协调责任，但不是社区管理者。"
      },
      npcEvolution: {
        en: "NPCs update trust, workload concerns, community respect, and future volunteer strategy from interaction.",
        zh: "NPC 会根据互动更新信任、工作量顾虑、社区尊重判断和后续志愿策略。"
      },
      gameGoal: {
        en: "Help the volunteer team create a fair, safe, realistic plan that respects community feedback.",
        zh: "帮助志愿团队形成公平、安全、现实，并尊重社区反馈的活动计划。"
      },
      initialObjective: {
        en: "Talk with volunteers, understand the site needs, and decide how you can contribute without taking over.",
        zh: "和志愿者交流，理解现场需求，并决定你如何参与而不抢走空间。"
      },
      firstTalkObjective: {
        en: "Start by talking privately with at least one NPC to understand their concerns about the volunteer day.",
        zh: "先和至少一位 NPC 单独交流，了解他们对社区志愿活动的顾虑。"
      },
      allTasksDoneObjective: {
        en: "The volunteer plan is mostly ready. Make a final commitment, or keep talking so the GM can judge whether the session can end.",
        zh: "志愿计划已经基本成型。请做出最终承诺，或继续交流让 GM 判断是否可以结束。"
      },
      workspace: {
        title: { en: "Volunteer clipboard", zh: "志愿者夹板" },
        panelTitle: { en: "Volunteer workspace", zh: "志愿者工作区" },
        body: {
          en: "Open this to review the route map, supply list, feedback cards, or a small action to submit.",
          zh: "打开后查看路线图、物资清单、反馈卡，或处理一个需要提交的小行动。"
        },
        guidance: {
          en: "Route maps, supply notes, resident feedback, and volunteer tasks will appear here.",
          zh: "路线图、物资记录、居民反馈和志愿任务会出现在这里。"
        },
        noTask: {
          en: "Nothing new is waiting on the volunteer clipboard right now. Keep talking with the team.",
          zh: "志愿者夹板里暂时没有新的内容。你可以继续和团队交流。"
        }
      },
      taskBoard: {
        title: { en: "Volunteer plan board", zh: "志愿计划板" },
        eyebrow: { en: "Volunteer board", zh: "志愿计划板" },
        objectLabel: { en: "volunteer board", zh: "志愿计划板" },
        guidance: {
          en: "Use this board to understand the volunteer plan. When someone asks you to review or handle something, open the volunteer clipboard from the lower-right HUD or press B.",
          zh: "计划板展示当前志愿活动安排。当有人请你查看或处理内容时，点击右下角志愿者夹板或按 B。"
        }
      },
      agent: {
        label: "community volunteer coordination scenario",
        playerLabel: "the new volunteer",
        groupLabel: "the volunteer team",
        finalGoal: {
          en: "Help the new volunteer integrate healthily while the team forms a fair, realistic, community-respecting service plan.",
          zh: "帮助新志愿者健康融入，同时让团队形成公平、现实、尊重社区需求的服务计划。"
        },
        endSuccess: {
          en: "The new volunteer becomes a reliable participant, and the team forms a fair, realistic, community-respecting plan.",
          zh: "新志愿者成为可靠参与者，并且团队形成了公平、现实、尊重社区需求的计划。"
        },
        endFailure: {
          en: "Healthy volunteer coordination is no longer realistically supported, community respect is harmed, or continuing would normalize unsafe/unfair participation.",
          zh: "当前状态已经无法支持健康志愿协作，社区尊重被破坏，或继续会让不安全/不公平参与正常化。"
        }
      },
      storyWorld: {
        en: {
          setting: "A campus-adjacent community center team is preparing a low-risk community collaboration day.",
          timeline: "This session covers today's planning meeting only: task assignment, supply review, resident feedback, volunteer workload, and a final activity plan.",
          allowedCommitments: [
            "review the volunteer clipboard now",
            "choose one realistic volunteer task during this meeting",
            "adjust the route, supply list, or shift plan",
            "set one end-of-activity debrief checkpoint"
          ],
          disallowedCommitments: [
            "partisan political organizing or religious recruitment",
            "dangerous labor, traffic control, disaster response, or solo contact with vulnerable people",
            "collect private resident data",
            "invent formal approvals, legal/medical advice, or 24-hour service promises"
          ]
        },
        zh: {
          setting: "校园附近社区中心的志愿团队正在准备一次低风险社区协作日。",
          timeline: "本局只覆盖今天这次现场筹备会：任务分配、物资查看、居民反馈、志愿者工作量和最终活动计划。",
          allowedCommitments: [
            "现在查看志愿者夹板里的内容",
            "在这次会议里选择一个现实志愿任务",
            "调整路线、物资清单或轮班安排",
            "设定一次活动结束复盘检查点"
          ],
          disallowedCommitments: [
            "党派政治组织或宗教动员",
            "危险劳动、交通指挥、灾害救援或单独接触脆弱群体",
            "收集居民私人信息",
            "编造正式审批、法律/医疗建议或24小时服务承诺"
          ]
        }
      },
      npcs: [
        { id: "mina", name: "Liang", color: "#6c8b55", role: "Practical supply-station coordinator", roleZh: "务实强势的物资站协调员", values: ["efficiency", "reliability", "results"], style: "direct and pressure-heavy but not unkind", styleZh: "直接、有压迫感但不是坏人", emotion: "busy and tense", trust: 50, belonging: 72, position: { x: 24, y: 45 }, model: DEEPSEEK_FLASH_MODEL, memory: ["Liang sees late or vague help as disrespectful to the team."], strategy: "Trust the newcomer only if they make a concrete, reliable contribution.", initialRelationship: { competence: 52, care: 44, reliability: 50, disruption: 42 }, initialValueTradeoffs: { task: 78, inclusion: 38, fairness: 50, psychologicalSafety: 40 } },
        { id: "leo", name: "Mo", color: "#bf6f73", role: "New young volunteer", roleZh: "想被看见的新手志愿者", values: ["being seen", "growth", "peer recognition"], style: "enthusiastic but uneven", styleZh: "热情但不稳定", emotion: "excited and nervous", trust: 45, belonging: 38, position: { x: 50, y: 37 }, model: DEEPSEEK_FLASH_MODEL, memory: ["Mo wants a real responsibility but worries about being treated as too young."], strategy: "Look for whether the newcomer makes space for inexperienced volunteers.", initialRelationship: { competence: 42, care: 48, reliability: 40, disruption: 38 }, initialValueTradeoffs: { task: 46, inclusion: 70, fairness: 56, psychologicalSafety: 52 } },
        { id: "sam", name: "He", color: "#597ea8", role: "Skeptical local resident", roleZh: "慢热怀疑的老居民", values: ["dignity", "tradition", "reciprocity"], style: "slow to trust and rule-conscious", styleZh: "慢热、试探、爱讲规矩", emotion: "skeptical", trust: 22, belonging: 55, position: { x: 84, y: 50 }, model: DEEPSEEK_FLASH_MODEL, memory: ["He dislikes volunteer plans that feel like outsiders performing kindness for show."], strategy: "Wait to see whether the newcomer remembers local details and respects residents.", initialRelationship: { competence: 34, care: 32, reliability: 28, disruption: 62 }, initialValueTradeoffs: { task: 44, inclusion: 40, fairness: 68, psychologicalSafety: 48 } },
        { id: "riley", name: "Joanne", color: "#8b5a83", role: "External CSR volunteer", roleZh: "目标导向的外部资源连接者", values: ["impact", "professionalism", "measurable outcomes"], style: "polite, fast, and outcome-driven", styleZh: "礼貌、目标导向、略有距离", emotion: "confident and impatient", trust: 60, belonging: 30, position: { x: 66, y: 40 }, model: DEEPSEEK_FLASH_MODEL, memory: ["Joanne thinks unclear community work needs better process and visible results."], strategy: "Push for structure, but learn whether local relationships matter more than metrics.", initialRelationship: { competence: 62, care: 36, reliability: 54, disruption: 40 }, initialValueTradeoffs: { task: 74, inclusion: 34, fairness: 42, psychologicalSafety: 34 } },
        { id: "nora", name: "Lian", color: "#d9aa4e", role: "Community kitchen volunteer", roleZh: "含蓄疲惫的社区厨房志愿者", values: ["care", "mutual aid", "dignity"], style: "warm, quiet, action-based", styleZh: "热心、含蓄、用行动表达", emotion: "warm but tired", trust: 65, belonging: 80, position: { x: 86, y: 66 }, model: DEEPSEEK_FLASH_MODEL, memory: ["Lian keeps helping even when tired and rarely says what she needs."], strategy: "Notice whether the newcomer respects invisible care work and avoids wasting effort.", initialRelationship: { competence: 58, care: 68, reliability: 60, disruption: 28 }, initialValueTradeoffs: { task: 54, inclusion: 60, fairness: 72, psychologicalSafety: 64 } }
      ],
      tasks: [
        { id: "understand_concerns", title: { en: "Understand community needs", zh: "理解社区需求" }, detail: { en: "Learn what residents and volunteers actually need before planning.", zh: "在制定计划前，先了解居民和志愿者真正需要什么。" }, progress: 10 },
        { id: "claim_task", title: { en: "Claim a realistic volunteer task", zh: "认领现实可行的志愿任务" }, detail: { en: "Choose a real task without taking over the whole activity.", zh: "选择一个真实任务，但不抢走整个活动的主导权。" }, progress: 0 },
        { id: "share_responsibilities", title: { en: "Make shifts and supplies visible", zh: "让轮班和物资可见" }, detail: { en: "Clarify who handles routes, supplies, welcome packs, and rest breaks.", zh: "说明谁负责路线、物资、欢迎包和休息轮换。" }, progress: 0 },
        { id: "support_member", title: { en: "Prevent volunteer overwork", zh: "避免志愿者过劳" }, detail: { en: "Support people carrying too much work without shaming them.", zh: "支持承担过多工作的人，同时不羞辱或强迫对方。" }, progress: 0 },
        { id: "set_checkpoint", title: { en: "Set an activity debrief", zh: "设置活动复盘" }, detail: { en: "Create one end-of-activity review point.", zh: "为活动结束设置一次复盘检查点。" }, progress: 0 }
      ],
      decisionWindows: {
        en: [
          { type: "Entry", question: "You have just joined the volunteer team. How do you introduce yourself?", gmNote: "This first decision is about contributing without taking over or ignoring local knowledge.", options: ["Introduce yourself as a new volunteer who wants to understand the site first.", "Say you can reorganize the plan quickly if people follow your lead.", "Ask what the community center needs most today before choosing a role.", "Keep it brief and observe how the team already works."] },
          { type: "Role Claim", question: "The team asks what task you can take. What do you do?", gmNote: "A useful volunteer role should be real, bounded, and respectful.", options: ["Choose a concrete support task such as supplies, welcome packs, or route notes.", "Ask to lead the full activity plan so it becomes more efficient.", "Pair with an experienced volunteer before taking a visible task.", "Ask which task is least wanted and offer to help there."] },
          { type: "Resource Conflict", question: "Time, supplies, and volunteers are limited. How do you respond?", gmNote: "The team needs realistic prioritization without dismissing people.", options: ["Use the clipboard to prioritize tasks by urgency and community need.", "Push for the most visible outcome so the activity looks successful.", "Ask residents' feedback to decide what can be reduced safely.", "Suggest everyone work faster without changing the plan."] },
          { type: "Workload Fairness", question: "One long-time volunteer is quietly taking on too much. What do you do?", gmNote: "Fairness includes invisible care work and rest.", options: ["Suggest a rotation so no one becomes the default helper.", "Thank them and let them continue because they know the work best.", "Offer to take one specific piece from them during this meeting.", "Ask the whole team to name what they can realistically carry."] },
          { type: "Final Commitment", question: "The team needs a final volunteer plan. What commitment do you make?", gmNote: "The final plan should be fair, safe, and community-respecting.", options: ["Commit to one realistic task and one end-of-activity debrief point.", "Suggest a plan that includes resident feedback, supplies, shifts, and rest.", "Step back and let the original volunteers decide your role.", "Offer to take over coordination if the team feels uncertain."] }
        ],
        zh: [
          { type: "进入团队", question: "你刚加入志愿团队。你会如何介绍自己？", gmNote: "第一个决策考察你如何贡献，同时不抢主导、不忽视本地经验。", options: ["说明自己是新志愿者，想先了解现场再参与。", "表示如果大家听你安排，你可以快速重组计划。", "先询问社区中心今天最需要什么，再选择角色。", "简单介绍自己，然后观察团队原本如何运作。"] },
          { type: "认领角色", question: "团队问你可以承担什么任务。你会怎么做？", gmNote: "有用的志愿角色应该真实、有边界，并且尊重现场。", options: ["选择一个具体支持任务，比如物资、欢迎包或路线记录。", "请求负责整个活动计划，让流程更有效率。", "先和有经验的志愿者搭档，再承担显眼任务。", "询问哪个任务最没人想做，并提出去帮那一块。"] },
          { type: "资源冲突", question: "时间、物资和人手都有限。你会如何回应？", gmNote: "团队需要现实排序，但不能忽视人的处境。", options: ["用夹板按紧急程度和社区需要来排序任务。", "优先做最能展示成果的部分，让活动看起来成功。", "根据居民反馈决定哪些内容可以安全缩小。", "建议大家加快速度，不改变原计划。"] },
          { type: "工作量公平", question: "一位长期志愿者正在默默承担太多。你会怎么做？", gmNote: "公平也包括看见隐形照护劳动和休息。", options: ["建议设置轮换，避免某个人变成默认帮手。", "感谢对方，并让对方继续负责，因为ta最熟悉。", "提出在这次会议里接过一个具体部分。", "请全队说出各自现实能承担多少。"] },
          { type: "最终承诺", question: "团队需要形成最终志愿计划。你会做出什么承诺？", gmNote: "最终计划应该公平、安全，并尊重社区需求。", options: ["承诺一个现实任务，并设置一次活动结束复盘。", "建议计划包括居民反馈、物资、轮班和休息。", "退后一步，让原志愿者决定你参与到什么程度。", "如果团队不确定，提出由自己接手协调。"] }
        ]
      },
      decisionOptionUtterances: communityVolunteerDecisionOptionUtterances,
      openingDecisionCue: { en: "Liang turns the volunteer role question to you.", zh: "Liang 把志愿角色的问题交给了你。" },
      openingHelp: { en: "The volunteer team has invited you to introduce yourself. Choose how you enter the activity.", zh: "志愿团队邀请你介绍自己。请选择你如何进入这次活动。" },
      openingLines: [
        { speaker: "Game Master", kind: "system", text: { en: "The community volunteer team is already preparing the activity. NPC reactions will evolve from the social state and your choices, not a fixed route.", zh: "社区志愿团队正在准备活动。NPC 的反应会根据社交状态和你的选择演化，而不是固定路线。" }, emotion: "pacing", tone: "open-ended setup" },
        { speaker: "Liang", text: { en: "We need the supply list cleaned up before anyone starts promising things to residents.", zh: "在大家向居民承诺之前，我们得先把物资清单理清楚。" }, emotion: "busy", tone: "direct" },
        { speaker: "Joanne", text: { en: "A clearer process would help. Right now the plan is hard to measure.", zh: "流程更清楚会有帮助。现在这个计划很难衡量。" }, emotion: "focused", tone: "professional" },
        { speaker: "He", text: { en: "Measure all you want, but if you do not listen to people here, the plan will miss the point.", zh: "你们想怎么衡量都行，但如果不听这里的人，计划就会跑偏。" }, emotion: "skeptical", tone: "slow" },
        { speaker: "Lian", text: { en: "We can make it work, but people need breaks. The same few hands cannot carry everything.", zh: "活动可以做成，但大家也需要休息。不能总是那几个人扛全部。" }, emotion: "warm but tired", tone: "gentle" },
        { movePlayerTo: "opening" },
        { speaker: "Mo", text: { en: "The new volunteer is here. Maybe they can start with something real, but not too overwhelming.", zh: "新志愿者到了。也许 ta 可以从真实但不太压人的任务开始。" }, emotion: "eager", tone: "hopeful" },
        { speaker: "Liang", text: { en: "Welcome. Before we assign work, how would you like to introduce yourself to the volunteer team?", zh: "欢迎你来。分配任务前，你想怎么向志愿团队介绍自己？" }, emotion: "carefully welcoming", tone: "direct" }
      ],
      metrics: { groupProgress: 28, groupClimate: 56 }
    }
  };

  const playableScenarioSpecs = {
    "newcomer-circle": scenarioSpecs["newcomer-circle"]
  };

  window.SocialEvoScenarios = {
    baseNpcs,
    decisionWindows,
    decisionWindowsZh,
    decisionOptionUtterances,
    designedActionCodeByOptionId,
    baseProjectTasks,
    scenarioSpecs: playableScenarioSpecs,
    legacyScenarioSpecs: scenarioSpecs,
    playableScenarioIds: ["newcomer-circle"]
  };
})();
