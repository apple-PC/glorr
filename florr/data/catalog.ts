// 【原版全内容清单】florr.io 花瓣 / 生物 / 区域 / NPC
// 考据来源:florrio.wiki.gg「Petals」分类页 + official-florrio.fandom.com 全站导航(2026-11-07)
// 本文件只列「内容身份」:id / 英文名 / 中文名 / 角色 / 机制标签 / 最低稀有度 / 所属区域。
// 数值不在这里 —— 见 petals.ts / mobs.ts 的 VERIFIED 覆盖与 role 占位默认,并带 src 标记。

/** 花瓣角色(对齐 wiki 六大类 + 功能类) */
export type PetalRole = 'melee' | 'ranged' | 'heal' | 'summon' | 'buff' | 'tank' | 'utility';

/** 机制标签:解释器在 sim/ 集中实现,新增内容只加数据,不改逻辑分支 */
export type PetalTag =
  | 'multihit' | 'singlehit' | 'particles' | 'split' | 'chain' | 'bounce'
  | 'homing' | 'mana' | 'poison' | 'slow' | 'knockback' | 'armor'
  | 'heal' | 'regen' | 'absorb' | 'shield' | 'maxhp' | 'lifesteal'
  | 'summon' | 'aura' | 'passive' | 'luck' | 'random' | 'crit'
  | 'rotation' | 'orbit' | 'pickup' | 'speed' | 'defensive' | 'onhit'
  | 'unique' | 'uncraftable';

export interface PetalRow {
  id: string;
  en: string;
  zh: string;
  role: PetalRole;
  tags: PetalTag[];
  minRarity: number;
  /** wiki 分类页里的原始描述(用于图鉴/机制实现参考) */
  note?: string;
}

// 格式:[id, en, zh, role, tags(逗号分隔), minRarity, note?]
const RAW: [string, string, string, PetalRole, string, number, string?][] = [
  // ---------- Multihit 多段输出 ----------
  ['basic', 'Basic', '基础', 'melee', 'multihit', 0, 'A simple petal without special qualities.'],
  ['bean', 'Bean', '豆子', 'melee', 'multihit', 2, 'Deals more damage if there are no friendly players nearby.'],
  ['bone', 'Bone', '骨头', 'melee', 'multihit,armor', 2, "The only petal with an Armor stat."],
  ['broccoli', 'Broccoli', '西兰花', 'ranged', 'multihit,particles,split', 3, 'Ejects particles upon impact (Coin + Peas).'],
  ['card', 'Card', '纸牌', 'melee', 'multihit,random', 3, 'Random stats every time it reloads.'],
  ['chip', 'Poker Chip', '扑克筹码', 'melee', 'multihit,luck', 3, 'High chance to not take damage from hitting something.'],
  ['claw', 'Claw', '爪子', 'melee', 'multihit,crit', 2, 'Extra damage if victim is above 80% max HP.'],
  ['clay', 'Clay', '黏土', 'melee', 'multihit', 2, 'More damage the further you travelled since it loaded.'],
  ['cog', 'Cogwheel', '齿轮', 'utility', 'rotation', 3, "Makes petal rotation move in steps of 60º."],
  ['coin', 'Coin', '硬币', 'melee', 'multihit', 2, 'Stronger variant of Basic.'],
  ['corn', 'Corn', '玉米', 'melee', 'multihit', 2, 'Extremely high Health stat.'],
  ['dice', 'Dice', '骰子', 'melee', 'multihit,crit,luck', 4, 'Small chance of 35x damage, increases with Luck.'],
  ['domino', 'Domino', '多米诺', 'melee', 'multihit,random', 3, 'Reloads extremely quickly, random damage each reload.'],
  ['heavy', 'Heavy', '重', 'melee', 'multihit,knockback,rotation', 0, 'Extremely high mass, pushes mobs; slows rotation.'],
  ['leaf', 'Leaf', '叶子', 'heal', 'regen,passive', 1, 'Heals the user passively.'],
  ['orange', 'Orange', '橙子', 'melee', 'multihit,particles', 2, 'Multiple particles, each a weak mini-petal.'],
  ['pearl', 'Pearl', '珍珠', 'melee', 'multihit', 4, 'Very high Health and Damage, but hard to hit.'],
  ['rock', 'Rock', '岩石', 'melee', 'multihit', 2, 'Very high Health and Damage stats.'],
  ['saw', 'Sawblade', '锯片', 'melee', 'multihit', 3, 'Very high Health, extremely high Damage.'],
  ['tomato', 'Tomato', '番茄', 'melee', 'multihit', 2, 'More damage the longer it has been loaded.'],
  ['triangle', 'Triangle', '三角形', 'melee', 'multihit', 2, 'More damage the more Triangles are used.'],
  ['wing', 'Wing', '翅膀', 'ranged', 'orbit', 2, 'Increased range and decent Damage, slower reload.'],
  // ---------- Singlehit 单次高伤 ----------
  ['battery', 'Battery', '电池', 'ranged', 'chain,onhit', 3, 'Lightning zap equal to Lightning on every hit; reloads every 3 zaps.'],
  ['coral', 'Coral', '珊瑚', 'melee', 'split', 2, 'Splits into smaller weaker pieces each hit.'],
  ['dust', 'Dust', '灰尘', 'melee', 'particles,singlehit', 1, 'Multiple particles that separate in orbit when attacking.'],
  ['glass', 'Glass', '玻璃', 'melee', 'singlehit', 1, 'Unbreakable; passes through mobs, once/sec per mob.'],
  ['fast', 'Light', '轻', 'melee', 'particles,singlehit', 0, 'Many particles, each an extremely weak Basic.'],
  ['lightning', 'Lightning', '闪电', 'ranged', 'chain,onhit', 3, 'Lightning zap on hit, chains to nearby mobs.'],
  ['rice', 'Rice', '大米', 'melee', 'singlehit', 1, 'Reloads instantly.'],
  ['sand', 'Sand', '沙子', 'melee', 'particles,singlehit', 1, 'Many particles, all clumped together.'],
  ['stinger', 'Stinger', '蜂针', 'melee', 'particles,singlehit', 1, 'Many high-damage particles with 1 Health, long reload.'],
  ['blood_stinger', 'Blood Stinger', '血螫针', 'melee', 'particles,singlehit', 4, 'Faster reload at the cost of user HP each reload.'],
  ['magic_stinger', 'Magic Stinger', '魔法螫针', 'melee', 'particles,singlehit,mana', 5, 'Mana variant of Stinger.'],
  // ---------- Ranged 远程 ----------
  ['blueberries', 'Blueberries', '蓝莓', 'ranged', 'mana,particles', 4, 'Stronger Peas, requires Mana to reload.'],
  ['carrot', 'Carrot', '胡萝卜', 'ranged', 'bounce', 2, 'High Health, decent Damage; moves fast and bounces.'],
  ['grapes', 'Grapes', '葡萄', 'ranged', 'poison,particles', 3, 'Variant of Peas dealing Poison instead of Damage.'],
  ['laser', 'Laser', '激光器', 'ranged', 'chain', 5, 'Red line dealing damage to anything it touches.'],
  ['missile', 'Missile', '导弹', 'ranged', 'homing', 2, 'Extremely high Damage, little Health, slight auto-aim.'],
  ['magic_missile', 'Magic Missile', '魔法导弹', 'ranged', 'homing,mana', 5, 'Magic Missile requires Mana to reload.'],
  ['mecha_missile', 'Mecha Missile', '机械导弹', 'ranged', 'homing', 6, 'Flies at mobs if a valid Mecha Antennae is equipped.'],
  ['peas', 'Peas', '豌豆', 'ranged', 'particles', 2, 'Multiple particles fly off when attacking or defending.'],
  ['web', 'Web', '蛛网', 'ranged', 'slow', 2, 'Slows targets in an area.'],
  ['electric_web', 'Electric Web', '电网', 'ranged', 'slow,chain', 5, 'Slows less but deals small DPS.'],
  // ---------- Summoner 召唤 ----------
  ['ant_egg', 'Ant Egg', '蚁卵', 'summon', 'summon', 3, 'Spawns friendly Soldier Ants (Termites with Relic).'],
  ['beetle_egg', 'Beetle Egg', '甲虫卵', 'summon', 'summon', 4, 'Spawns a friendly Beetle (Hel Beetle with Corruption).'],
  ['sacrifice', 'Blood Sacrifice', '血祭', 'summon', 'summon,unique,uncraftable', 7, 'Spawns a hostile mob of equal rarity on death; PvP Rift only.'],
  ['stick', 'Mysterious Stick', '神秘树枝', 'summon', 'summon', 5, 'Spawns friendly Sandstorms that move as you do.'],
  ['magic_stick', 'Magic Stick', '魔法树枝', 'summon', 'summon,mana', 6, 'Mana variant of Mysterious Stick.'],
  ['square', 'Square', '方块', 'summon', 'summon', 3, 'Spawns a friendly Square of equal rarity.'],
  // ---------- Healing 治疗 ----------
  ['dahlia', 'Dahlia', '大丽花', 'heal', 'heal,particles', 3, 'Particles absorbable by friendly flowers to heal.'],
  ['fang', 'Fang', '尖牙', 'heal', 'lifesteal', 3, 'Heals the user a % of damage dealt.'],
  ['monstera', 'Monstera', '龟背竹', 'heal', 'aura', 4, 'Heals friendly flowers around it.'],
  ['rose', 'Rose', '玫瑰', 'heal', 'heal', 1, 'Absorbable by friendly flowers (including user) to heal.'],
  ['starfish', 'Starfish', '海星', 'heal', 'regen', 3, 'Heals the user while under 75% max HP.'],
  ['totem', 'Totem', '图腾', 'heal', 'onhit', 5, 'Adds healing for 10s every time the user kills an enemy.'],
  ['yucca', 'Yucca', '丝兰', 'heal', 'regen,defensive', 4, 'Heals the user while in the defensive position.'],
  ['yggdrasil', 'Yggdrasil', '世界树之叶', 'heal', 'regen,aura', 7, 'Yggdrasil leaf.'],
  ['honey', 'Honey', '蜂蜜', 'heal', 'regen,passive', 2, 'Passive regen and slow resistance.'],
  // ---------- Tanking 防护 ----------
  ['cactus', 'Cactus', '仙人掌', 'tank', 'maxhp', 3, "Increases the user's maximum health while in use."],
  ['cotton', 'Cotton', '棉花', 'tank', 'absorb', 3, 'Any damage the user takes is absorbed by it.'],
  ['nazar', 'Nazar Amulet', '邪眼护符', 'tank', 'shield', 4, 'When loaded, reduces damage by 98% for up to 3 hits.'],
  ['relic', 'Mysterious Relic', '神秘遗物', 'tank', 'maxhp', 6, 'Max HP +%, but damage is shared with nearby Relic users.'],
  ['root', 'Root', '根', 'tank', 'armor', 3, 'Adds armor over time; lose some every hit.'],
  ['rubber', 'Rubber', '橡胶', 'tank', 'absorb,knockback', 3, 'Absorbs lightning damage, increases knockback.'],
  ['soil', 'Soil', '土', 'tank', 'maxhp,slow', 3, 'Max HP up, but larger and slower.'],
  ['sponge', 'Sponge', '海绵', 'tank', 'absorb', 4, 'Spreads damage taken over a period of time.'],
  ['magic_cactus', 'Magic Cactus', '魔法仙人掌', 'tank', 'maxhp,mana', 6, 'Mana variant of Cactus.'],
  ['magic_cotton', 'Magic Cotton', '魔法棉花', 'tank', 'absorb,mana', 6, 'Mana variant of Cotton.'],
  ['shell', 'Shell', '贝壳', 'tank', 'shield', 3, 'Shell.'],
  ['wax', 'Wax', '蜡', 'tank', 'armor', 4, 'Wax.'],
  // ---------- Utility 功能 / 增益 ----------
  ['air', 'Air', '空气', 'utility', 'orbit', 3, 'Air.'],
  ['amulet', 'Amulet', '护符', 'utility', 'luck', 3, 'Amulet.'],
  ['ankh', 'Ankh', '安卡', 'utility', 'unique', 7, 'Ankh.'],
  ['antennae', 'Antennae', '触角', 'utility', 'pickup', 3, 'Antennae.'],
  ['mecha_antennae', 'Mecha Antennae', '机械触角', 'utility', 'homing', 6, 'Enables Mecha Missile targeting.'],
  ['bandage', 'Bandage', '绷带', 'heal', 'regen', 2, 'Bandage.'],
  ['basil', 'Basil', '罗勒', 'utility', 'poison', 3, 'Basil.'],
  ['bubble', 'Bubble', '泡泡', 'utility', 'knockback', 2, 'Bubble.'],
  ['magic_bubble', 'Magic Bubble', '魔法泡泡', 'utility', 'knockback,mana', 6, 'Mana variant of Bubble.'],
  ['bulb', 'Light Bulb', '灯泡', 'utility', 'chain', 4, 'Light Bulb.'],
  ['bur', 'Bur', '刺果', 'utility', 'onhit', 2, 'Bur.'],
  ['champion_crown', "Champion's Crown", '王者之冠', 'utility', 'aura,unique', 8, "Champion's Crown."],
  ['pharaoh_crown', "Pharaoh's Crown", '法老之冠', 'utility', 'aura,unique', 8, "Pharaoh's Crown."],
  ['cutter', 'Cutter', '切割器', 'utility', 'rotation', 4, 'Cutter.'],
  ['dandelion', 'Dandelion', '蒲公英', 'ranged', 'particles', 2, 'Dandelion.'],
  ['disc', 'Disc', '圆盘', 'utility', 'orbit', 4, 'Disc.'],
  ['fragment', 'Fragment', '碎片', 'melee', 'singlehit', 3, 'Fragment.'],
  ['faster', 'Faster', '更快', 'buff', 'rotation', 2, 'Increases petal rotation speed.'],
  ['goggles', 'Paranormal Goggles', '灵异护目镜', 'utility', 'luck', 5, 'Paranormal Goggles.'],
  ['iris', 'Iris', '鸢尾', 'ranged', 'poison', 3, 'Iris.'],
  ['jelly', 'Jelly', '果冻', 'utility', 'knockback', 2, 'Jelly.'],
  ['magic_leaf', 'Magic Leaf', '魔法叶子', 'heal', 'regen,mana', 6, 'Mana variant of Leaf.'],
  ['golden_leaf', 'Golden Leaf', '金叶', 'utility', 'luck', 5, 'Golden Leaf.'],
  ['dead_leaf', 'Dead Leaf', '枯叶', 'utility', 'armor', 4, 'Dead Leaf.'],
  ['lentil', 'Lentil', '小扁豆', 'utility', 'particles', 3, 'Lentil.'],
  ['lotus', 'Lotus', '荷花', 'utility', 'defensive', 5, 'Lotus.'],
  ['magic_eye', 'Magic Eye', '魔法之眼', 'utility', 'homing', 6, 'Magic Eye.'],
  ['magnet', 'Magnet', '磁铁', 'buff', 'pickup', 2, 'Greatly increases drop pickup range.'],
  ['dark_mark', 'Dark Mark', '暗黑标记', 'utility', 'crit', 5, 'Dark Mark.'],
  ['mimic', 'Mimic', '拟态', 'utility', 'random', 6, 'Mimic.'],
  ['mjolnir', 'Mjölnir', '雷神之锤', 'melee', 'chain,unique', 8, 'Mjölnir.'],
  ['moon_rock', 'Moon Rock', '月石', 'utility', 'orbit', 4, 'Moon Rock.'],
  ['mana_orb', 'Mana Orb', '魔法球', 'utility', 'mana', 5, 'Mana Orb.'],
  ['pincer', 'Pincer', '螯', 'melee', 'multihit', 3, 'Pincer.'],
  ['plank', 'Plank', '木板', 'tank', 'shield', 2, 'Plank.'],
  ['pollen', 'Pollen', '花粉', 'ranged', 'particles', 2, 'Pollen.'],
  ['poo', 'Poo', '便便', 'utility', 'slow', 2, 'Poo.'],
  ['powder', 'Mysterious Powder', '神秘粉末', 'utility', 'random', 5, 'Mysterious Powder.'],
  ['privet', 'Privet Berry', '女贞子', 'utility', 'poison', 3, 'Privet Berry.'],
  ['salt', 'Salt', '盐', 'utility', 'onhit', 3, 'Salt.'],
  ['shovel', 'Shovel', '铲子', 'utility', 'orbit', 4, 'Shovel.'],
  ['soul_splitter', 'Soul Splitter', '灵魂分裂', 'utility', 'split,unique', 8, 'Soul Splitter.'],
  ['third_eye', 'Third Eye', '第三只眼', 'utility', 'homing', 5, 'Third Eye.'],
  ['magic_third_eye', 'Magic Third Eye', '魔法第三只眼', 'utility', 'homing,mana', 7, 'Magic Third Eye.'],
  ['talisman', 'Talisman of Evasion', '闪避护符', 'tank', 'shield', 5, 'Talisman of Evasion.'],
  ['uranium', 'Uranium', '铀', 'ranged', 'poison,chain', 5, 'Uranium.'],
  ['yin_yang', 'Yin Yang', '阴阳', 'utility', 'aura', 6, 'Yin Yang.'],
  ['clover', 'Clover', '三叶草', 'buff', 'luck,rotation', 2, 'Slightly increases petal rotation speed.'],
  ['compass', 'Compass', '指南针', 'utility', 'pickup', 3, 'Compass.'],
  ['corruption', 'Corruption', '腐化', 'utility', 'summon,luck', 6, 'Corruption (Beetle Egg synergy).'],
];

export const PETALS: PetalRow[] = RAW.map(([id, en, zh, role, tags, minRarity, note]) => ({
  id, en, zh, role,
  tags: tags.split(',') as PetalTag[],
  minRarity,
  note,
}));

export const PETAL_BY_ID = new Map(PETALS.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// 生物全量清单(按 wiki 导航;family 用于渲染归类,area 用于刷怪分区)
// ---------------------------------------------------------------------------
export type MobFamily = 'ant' | 'bee' | 'beetle' | 'centipede' | 'ladybug' | 'spider' | 'wasp' | 'rock' | 'plant' | 'ocean' | 'hel' | 'mecha' | 'special' | 'termite';

export interface MobRow {
  id: string;
  en: string;
  zh: string;
  family: MobFamily;
  area: string;
  /** wiki 分类:static / passive / neutral / aggressive */
  behavior: 'static' | 'passive' | 'neutral' | 'aggressive';
  /** 是否 Boss / 特殊实体 */
  boss?: boolean;
}

// [id, en, zh, family, area, behavior]
const MRAW: [string, string, string, MobFamily, string, MobRow['behavior'], boolean?][] = [
  ['rock', 'Rock', '岩石', 'rock', 'garden', 'static'],
  ['ladybug', 'Ladybug', '瓢虫', 'ladybug', 'garden', 'passive'],
  ['bee', 'Bee', '蜜蜂', 'bee', 'garden', 'passive'],
  ['baby_ant', 'Baby Ant', '幼蚁', 'ant', 'garden', 'passive'],
  ['worker_ant', 'Worker Ant', '工蚁', 'ant', 'garden', 'neutral'],
  ['soldier_ant', 'Soldier Ant', '兵蚁', 'ant', 'garden', 'aggressive'],
  ['hornet', 'Hornet', '黄蜂', 'wasp', 'garden', 'aggressive'],
  ['spider', 'Spider', '蜘蛛', 'spider', 'garden', 'aggressive'],
  ['bumblebee', 'Bumble Bee', '熊蜂', 'bee', 'garden', 'passive'],
  ['centipede', 'Centipede', '蜈蚣', 'centipede', 'garden', 'passive'],
  ['dandelion', 'Dandelion', '蒲公英', 'plant', 'garden', 'static'],
  ['bush', 'Bush', '灌木', 'plant', 'garden', 'static'],
  ['cactus_mob', 'Cactus', '仙人掌', 'plant', 'desert', 'static'],
  ['ant_hole', 'Ant Hole', '蚁穴', 'ant', 'ant_hell', 'static', true],
  ['ant_egg_mob', 'Ant Egg', '蚁卵', 'ant', 'ant_hell', 'static'],
  ['queen_ant', 'Queen Ant', '蚁后', 'ant', 'ant_hell', 'aggressive', true],
  ['soldier_diver_ant', 'Soldier Diver Ant', '潜水兵蚁', 'ant', 'ocean', 'aggressive'],
  ['fire_ant', 'Fire Ant', '火蚁', 'ant', 'desert', 'aggressive'],
  ['baby_fire_ant', 'Baby Fire Ant', '幼火蚁', 'ant', 'desert', 'passive'],
  ['worker_fire_ant', 'Worker Fire Ant', '工火蚁', 'ant', 'desert', 'neutral'],
  ['soldier_fire_ant', 'Soldier Fire Ant', '兵火蚁', 'ant', 'desert', 'aggressive'],
  ['queen_fire_ant', 'Queen Fire Ant', '火蚁后', 'ant', 'desert', 'aggressive', true],
  ['fire_ant_egg', 'Fire Ant Egg', '火蚁卵', 'ant', 'desert', 'static'],
  ['fire_ant_burrow', 'Fire Ant Burrow', '火蚁巢', 'ant', 'desert', 'static'],
  ['beetle', 'Beetle', '甲虫', 'beetle', 'desert', 'neutral'],
  ['beetle_mummy', 'Mummy Beetle', '木乃伊甲虫', 'beetle', 'pyramid', 'aggressive'],
  ['beetle_nazar', 'Nazar Beetle', '纳扎尔甲虫', 'beetle', 'pyramid', 'aggressive'],
  ['beetle_pharaoh', 'Pharaoh Beetle', '法老甲虫', 'beetle', 'pyramid', 'aggressive', true],
  ['beetle_hel', 'Hel Beetle', '冥界甲虫', 'beetle', 'hel', 'aggressive'],
  ['digger', 'Digger', '挖掘者', 'special', 'desert', 'aggressive'],
  ['sandstorm', 'Sandstorm', '沙暴', 'special', 'desert', 'aggressive'],
  ['scorpion', 'Scorpion', '蝎子', 'special', 'desert', 'aggressive'],
  ['ladybug_desert', 'Desert Ladybug', '沙漠瓢虫', 'ladybug', 'desert', 'passive'],
  ['centipede_desert', 'Desert Centipede', '沙漠蜈蚣', 'centipede', 'desert', 'aggressive'],
  ['crab', 'Crab', '螃蟹', 'ocean', 'ocean', 'neutral'],
  ['jellyfish', 'Jellyfish', '水母', 'ocean', 'ocean', 'passive'],
  ['starfish_mob', 'Starfish', '海星', 'ocean', 'ocean', 'static'],
  ['shell_mob', 'Shell', '贝壳', 'ocean', 'ocean', 'static'],
  ['sponge_mob', 'Sponge', '海绵', 'ocean', 'ocean', 'static'],
  ['square_mob', 'Square', '方块', 'special', 'ocean', 'neutral'],
  ['bubble_mob', 'Bubble', '泡泡', 'ocean', 'ocean', 'passive'],
  ['leech', 'Leech', '水蛭', 'ocean', 'sewers', 'aggressive'],
  ['fly', 'Fly', '苍蝇', 'special', 'sewers', 'aggressive'],
  ['roach', 'Roach', '蟑螂', 'special', 'sewers', 'aggressive'],
  ['garbage', 'Garbage', '垃圾', 'special', 'sewers', 'static'],
  ['moth', 'Moth', '蛾', 'special', 'jungle', 'passive'],
  ['mantis', 'Mantis', '螳螂', 'special', 'jungle', 'aggressive'],
  ['leafbug', 'Leafbug', '叶虫', 'plant', 'jungle', 'passive'],
  ['golden_leafbug', 'Golden Leafbug', '黄金叶虫', 'plant', 'jungle', 'passive'],
  ['firefly', 'Firefly', '萤火虫', 'special', 'jungle', 'passive'],
  ['firefly_magic', 'Magic Firefly', '魔法萤火虫', 'special', 'jungle', 'passive'],
  ['centipede_jungle', 'Jungle Centipede', '丛林蜈蚣', 'centipede', 'jungle', 'aggressive'],
  ['ladybug_jungle', 'Jungle Ladybug', '丛林瓢虫', 'ladybug', 'jungle', 'passive'],
  ['wasp', 'Wasp', '黄蜂', 'wasp', 'jungle', 'aggressive'],
  ['worm', 'Worm', '蠕虫', 'special', 'worm', 'aggressive', true],
  ['termite_mound', 'Termite Mound', '白蚁丘', 'termite', 'termite_mound', 'static', true],
  ['termite_egg', 'Termite Egg', '白蚁卵', 'termite', 'termite_mound', 'static'],
  ['baby_termite', 'Baby Termite', '幼白蚁', 'termite', 'termite_mound', 'passive'],
  ['worker_termite', 'Worker Termite', '工白蚁', 'termite', 'termite_mound', 'neutral'],
  ['soldier_termite', 'Soldier Termite', '兵白蚁', 'termite', 'termite_mound', 'aggressive'],
  ['termite_overmind', 'Termite Overmind', '白蚁主宰', 'termite', 'termite_mound', 'aggressive', true],
  ['ghost', 'Ghost', '幽灵', 'hel', 'hel', 'aggressive'],
  ['spider_hel', 'Hel Spider', '冥界蜘蛛', 'spider', 'hel', 'aggressive'],
  ['wasp_hel', 'Hel Wasp', '冥界黄蜂', 'wasp', 'hel', 'aggressive'],
  ['centipede_hel', 'Hel Centipede', '冥界蜈蚣', 'centipede', 'hel', 'aggressive'],
  ['tomb', 'Tomb', '墓碑', 'hel', 'hel', 'static'],
  ['barrel', 'Barrel', '木桶', 'special', 'factory', 'static'],
  ['gambler', 'Gambler', '赌徒', 'special', 'rift', 'neutral'],
  ['silverfish', 'Silverfish', '衣鱼', 'special', 'pyramid', 'aggressive'],
  ['crab_mecha', 'Mecha Crab', '机械螃蟹', 'mecha', 'factory', 'aggressive'],
  ['spider_mecha', 'Mecha Spider', '机械蜘蛛', 'mecha', 'factory', 'aggressive'],
  ['wasp_mecha', 'Mecha Wasp', '机械黄蜂', 'mecha', 'factory', 'aggressive'],
  ['mecha_flower', 'Mecha Flower', '机械花', 'mecha', 'factory', 'aggressive', true],
  ['target_dummy', 'Target Dummy', '假人', 'special', 'jungle', 'static'],
];

export const MOBS: MobRow[] = MRAW.map(([id, en, zh, family, area, behavior, boss]) => ({
  id, en, zh, family, area, behavior, boss,
}));
export const MOB_BY_ID = new Map(MOBS.map((m) => [m.id, m]));

// ---------------------------------------------------------------------------
// 区域与地下城(wiki World Map / Areas)
// ---------------------------------------------------------------------------
export interface AreaRow {
  id: string;
  en: string;
  zh: string;
  kind: 'surface' | 'dungeon' | 'special';
  /** 难度序,越大越深 */
  tier: number;
  /** 该区域的代表生物 id */
  mobs: string[];
  note?: string;
}

export const AREAS: AreaRow[] = [
  { id: 'garden', en: 'Garden', zh: '花园', kind: 'surface', tier: 0, mobs: ['baby_ant', 'worker_ant', 'ladybug', 'bee', 'rock', 'hornet', 'spider', 'bumblebee', 'centipede', 'dandelion'], note: '出生区,难度由内向外递增' },
  { id: 'desert', en: 'Desert', zh: '沙漠', kind: 'surface', tier: 1, mobs: ['beetle', 'scorpion', 'sandstorm', 'fire_ant', 'cactus_mob', 'digger', 'ladybug_desert', 'centipede_desert'], note: 'Trader 所在' },
  { id: 'ocean', en: 'Ocean', zh: '海洋', kind: 'surface', tier: 2, mobs: ['crab', 'jellyfish', 'starfish_mob', 'shell_mob', 'sponge_mob', 'square_mob', 'bubble_mob'], note: 'Oracle 所在' },
  { id: 'jungle', en: 'Jungle', zh: '丛林', kind: 'surface', tier: 3, mobs: ['mantis', 'moth', 'leafbug', 'wasp', 'firefly', 'centipede_jungle', 'ladybug_jungle'], note: 'Titan 锻唯一 / Target Dummy 测 DPS' },
  { id: 'hel', en: 'Hel', zh: '冥界', kind: 'surface', tier: 4, mobs: ['ghost', 'spider_hel', 'wasp_hel', 'centipede_hel', 'beetle_hel', 'tomb'], note: '最高危表区域' },
  { id: 'crystal_room', en: 'Crystal Room', zh: '水晶室', kind: 'special', tier: 3, mobs: [] },
  { id: 'sewers', en: 'Sewers', zh: '下水道', kind: 'dungeon', tier: 1, mobs: ['leech', 'fly', 'roach', 'garbage'] },
  { id: 'ant_hell', en: 'Ant Hell', zh: '蚂蚁地狱', kind: 'dungeon', tier: 1, mobs: ['ant_hole', 'ant_egg_mob', 'queen_ant', 'soldier_ant'] },
  { id: 'factory', en: 'Factory', zh: '工厂', kind: 'dungeon', tier: 3, mobs: ['barrel', 'crab_mecha', 'spider_mecha', 'wasp_mecha', 'mecha_flower'] },
  { id: 'pyramid', en: 'Pyramid', zh: '金字塔', kind: 'dungeon', tier: 3, mobs: ['beetle_mummy', 'beetle_nazar', 'beetle_pharaoh', 'silverfish'] },
  { id: 'rift', en: 'Rift', zh: '裂隙', kind: 'dungeon', tier: 4, mobs: ['gambler'], note: 'PvP;血祭唯一产出' },
  { id: 'termite_mound', en: 'Termite Mound', zh: '白蚁丘', kind: 'special', tier: 2, mobs: ['termite_mound', 'baby_termite', 'worker_termite', 'soldier_termite', 'termite_overmind'] },
  { id: 'worm', en: 'Worm', zh: '蠕虫区', kind: 'special', tier: 2, mobs: ['worm'] },
  { id: 'training', en: 'Training Grounds', zh: '训练场', kind: 'special', tier: 0, mobs: ['target_dummy'] },
];

export const AREA_BY_ID = new Map(AREAS.map((a) => [a.id, a]));

// ---------------------------------------------------------------------------
// 特殊 NPC(非战斗实体)
// ---------------------------------------------------------------------------
export interface NpcRow { id: string; en: string; zh: string; area: string; role: string }
export const NPCS: NpcRow[] = [
  { id: 'trader', en: 'Trader', zh: '商人', area: 'desert', role: '花瓣换同稀有度 Coin' },
  { id: 'target_dummy', en: 'Target Dummy', zh: '假人', area: 'jungle', role: '测 DPS' },
  { id: 'oracle', en: 'Oracle', zh: '神谕', area: 'ocean', role: '协助合成' },
  { id: 'titan', en: 'Titan', zh: '泰坦', area: 'jungle', role: '耗 5 个 Super 锻造唯一花瓣' },
];
