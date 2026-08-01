// One-off content script: applies the drafted bonus rounds to data/animals.json.
// Safe to re-run — it rewrites the same fields from this table each time.
import { readFileSync, writeFileSync } from "node:fs";

// Seven records name a species where they should name the family. The old
// commonName becomes `species` AND is appended to aliases, so typing the
// specific name still solves stage one.
const SPLITS = {
  "Star-Nosed Mole": "Mole",
  "Emperor Penguin": "Penguin",
  "Fennec Fox": "Fox",
  "Leopard Gecko": "Gecko",
  "Hawksbill Sea Turtle": "Sea Turtle",
  "Monarch Butterfly": "Butterfly",
  "Sea Otter": "Otter",
};

// Keyed by the ORIGINAL commonName. `a` is the correct answer and must equal
// `species` when species is set; `d` are the three decoys.
const ROUNDS = {
  // ---- species rounds ----
  "Star-Nosed Mole": { q: "You found a mole. But which one?", a: "Star-Nosed Mole", d: ["European Mole", "Eastern Mole", "Hairy-Tailed Mole"] },
  "Emperor Penguin": { q: "A penguin — but which species?", a: "Emperor Penguin", d: ["King Penguin", "Gentoo Penguin", "Adélie Penguin"] },
  "Fennec Fox": { q: "A fox. But which fox?", a: "Fennec Fox", d: ["Red Fox", "Arctic Fox", "Bat-Eared Fox"] },
  "Leopard Gecko": { q: "A gecko — which one?", a: "Leopard Gecko", d: ["Crested Gecko", "Tokay Gecko", "Day Gecko"] },
  "Hawksbill Sea Turtle": { q: "A sea turtle. Which species?", a: "Hawksbill Sea Turtle", d: ["Green Sea Turtle", "Loggerhead Sea Turtle", "Leatherback Sea Turtle"] },
  "Monarch Butterfly": { q: "A butterfly — but which one?", a: "Monarch Butterfly", d: ["Viceroy Butterfly", "Painted Lady", "Red Admiral"] },
  "Sea Otter": { q: "An otter. Which kind?", a: "Sea Otter", d: ["Giant Otter", "Eurasian Otter", "Asian Small-Clawed Otter"] },
  Pangolin: { q: "A pangolin — but which species?", a: "Sunda Pangolin", d: ["Chinese Pangolin", "Ground Pangolin", "Tree Pangolin"] },
  Chameleon: { q: "A chameleon. Which one?", a: "Common Chameleon", d: ["Veiled Chameleon", "Panther Chameleon", "Jackson's Chameleon"] },
  Sloth: { q: "A sloth — but which species?", a: "Brown-Throated Sloth", d: ["Hoffmann's Two-Toed Sloth", "Pale-Throated Sloth", "Maned Sloth"] },
  Seahorse: { q: "A seahorse. Which one?", a: "Long-Snouted Seahorse", d: ["Short-Snouted Seahorse", "Dwarf Seahorse", "Big-Belly Seahorse"] },
  Octopus: { q: "An octopus — but which species?", a: "Common Octopus", d: ["Giant Pacific Octopus", "Blue-Ringed Octopus", "Mimic Octopus"] },
  Flamingo: { q: "A flamingo. Which one?", a: "American Flamingo", d: ["Greater Flamingo", "Lesser Flamingo", "Chilean Flamingo"] },
  Hedgehog: { q: "A hedgehog — which species?", a: "European Hedgehog", d: ["African Pygmy Hedgehog", "Long-Eared Hedgehog", "Desert Hedgehog"] },
  Clownfish: { q: "A clownfish. But which one?", a: "Ocellaris Clownfish", d: ["Percula Clownfish", "Tomato Clownfish", "Maroon Clownfish"] },
  Peacock: { q: "A peafowl — which species?", a: "Indian Peafowl", d: ["Green Peafowl", "Congo Peafowl", "Palawan Peacock-Pheasant"] },
  Toucan: { q: "A toucan. Which one?", a: "Toco Toucan", d: ["Keel-Billed Toucan", "Channel-Billed Toucan", "Chestnut-Mandibled Toucan"] },
  Iguana: { q: "An iguana — but which species?", a: "Green Iguana", d: ["Marine Iguana", "Rhinoceros Iguana", "Desert Iguana"] },
  Ladybug: { q: "A ladybird. Which one?", a: "Seven-Spot Ladybird", d: ["Two-Spot Ladybird", "Harlequin Ladybird", "Convergent Lady Beetle"] },
  Tarsier: { q: "A tarsier — which species?", a: "Philippine Tarsier", d: ["Spectral Tarsier", "Horsfield's Tarsier", "Pygmy Tarsier"] },
  Puffin: { q: "A puffin. But which one?", a: "Atlantic Puffin", d: ["Horned Puffin", "Tufted Puffin", "Rhinoceros Auklet"] },

  // ---- fact rounds (no honest species split) ----
  Giraffe: { q: "One of these is true. Which?", a: "I have the same number of neck bones as you do", d: ["I have no vocal cords at all", "My spots fade away as I get older", "I sleep standing up for months at a time"] },
  "Red Panda": { q: "Which one of these is true?", a: "I have a false thumb — an extra wrist bone — for gripping bamboo", d: ["I'm a close cousin of the giant panda", "I hibernate right through the winter", "I'm born with my full red coat"] },
  Blobfish: { q: "Which of these is true about me?", a: "Down where I live, I look like an ordinary fish", d: ["I glow in the dark", "I fish with a glowing lure on my head", "I can survive out of water for days"] },
  Narwhal: { q: "One of these is true. Which?", a: "My 'horn' is really a tooth that grew out through my lip", d: ["I use it to break through sea ice", "I shed it and grow a new one each year", "Only the females grow one"] },
  Platypus: { q: "Which one is true?", a: "The males have venomous spurs on their back legs", d: ["I have forty teeth", "I can hold my breath for an hour", "I sleep standing up"] },
  Axolotl: { q: "Which of these is true about me?", a: "I can regrow a lost leg — and even parts of my brain", d: ["I have no eyes", "I breathe only through my mouth", "I turn into a frog when I grow up"] },
  Koala: { q: "One of these is true. Which?", a: "My fingerprints are so like yours they've confused crime scenes", d: ["I'm a kind of bear", "I drink several litres of water a day", "I eat a wide variety of leaves"] },
  Aardvark: { q: "Which one is true?", a: "My name means 'earth pig'", d: ["I'm a close relative of the anteater", "I have no teeth at all", "I can't dig"] },
  Pufferfish: { q: "Which of these is true about me?", a: "I puff up by swallowing water, not air", d: ["I blow myself up with air from my lungs", "My spines are completely harmless", "My poison wears off in sunlight"] },
  Dragonfly: { q: "One of these is true. Which?", a: "I spent most of my life underwater before I could fly", d: ["I sting like a wasp", "I live for only one day", "I can't see colour"] },
  Capybara: { q: "Which one is true?", a: "I'm the largest rodent in the world", d: ["I'm a kind of pig", "My teeth stop growing once I'm grown", "I can't swim"] },
  Chinchilla: { q: "Which of these is true about me?", a: "My fur is so dense that fleas can't live in it", d: ["I bathe in water every day", "I'm a kind of rabbit", "I have no tail"] },
  Jellyfish: { q: "One of these is true. Which?", a: "I have no brain, no heart and no bones", d: ["I'm a kind of fish", "I chase my prey down", "I can only sting while I'm alive"] },
};

const path = new URL("../data/animals.json", import.meta.url);
const animals = JSON.parse(readFileSync(path, "utf8"));

let splits = 0;
let species = 0;
let facts = 0;

for (const animal of animals) {
  const original = animal.commonName;
  const round = ROUNDS[original];
  if (!round) throw new Error(`No bonus round drafted for "${original}"`);

  if (SPLITS[original]) {
    animal.commonName = SPLITS[original];
    animal.species = original;
    if (!animal.aliases.some((a) => a.toLowerCase() === original.toLowerCase())) {
      animal.aliases.push(original);
    }
    splits++;
  }

  // Every fact-round question asks which statement is "true"; no species-round
  // question does. Testing the question is reliable — testing the shape of the
  // answer is not, and classified "I'm the largest rodent in the world" as a
  // species name.
  const isFactRound = round.q.includes("true");
  if (!isFactRound) {
    animal.species = round.a;
    species++;
  } else {
    facts++;
  }

  // Author order is irrelevant — the game reshuffles deterministically by
  // puzzle number — but vary it anyway so the raw file shows no pattern.
  const options = [...round.d];
  const at = (original.length + round.a.length) % 4;
  options.splice(at, 0, round.a);

  animal.bonus = { question: round.q, options, answerIndex: at };
}

writeFileSync(path, JSON.stringify(animals, null, 2) + "\n");
console.log(`${animals.length} records: ${splits} split, ${species} species rounds, ${facts} fact rounds`);
