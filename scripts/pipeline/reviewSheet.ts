export interface PendingRecord {
  qid: string;
  commonName: string;
  species?: string;
  hint1: string;
  hint2: string;
  hint3: string;
  funFacts: string;
  sourceUrl: string;
  bonus: { question: string; options: string[]; answerIndex: number };
  image: {
    file: string;
    author: string;
    licence: string;
    descriptionUrl: string;
  };
}

/**
 * Special:FilePath resolves a Commons title to the image itself, and GitHub
 * renders that inline in markdown.
 *
 * That is the whole reason review happens in a pull request rather than a
 * spreadsheet: the two judgements that must stay human are "is this photo
 * actually guessable" and "is this fact actually true", and both need the
 * picture and the source visible side by side. A spreadsheet cell shows a URL.
 */
function imageUrl(file: string): string {
  const name = file.replace(/^File:/, "").replace(/ /g, "_");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${name}?width=600`;
}

export function renderReviewSheet(records: PendingRecord[]): string {
  const header = `# Candidate review — ${records.length} animals

**To reject an animal, delete its whole \`##\` section, then save.**
When you are done, run \`npm run content:accept\`. Everything still here is
accepted; everything you deleted is recorded as rejected and never proposed
again.

Check two things per animal: does the photograph actually let you guess it,
and is every fact supported by the linked article?

---
`;

  const sections = records.map((record) => {
    const options = record.bonus.options
      .map((option, index) =>
        index === record.bonus.answerIndex
          ? `  - **${option}** ← correct`
          : `  - ${option}`
      )
      .join("\n");

    const species = record.species
      ? `**Species:** ${record.species}\n\n`
      : "";

    return `## ${record.qid} — ${record.commonName}

![${record.commonName}](${imageUrl(record.image.file)})

${species}**Clues**
1. ${record.hint1}
2. ${record.hint2}
3. ${record.hint3}

**Fun facts:** ${record.funFacts}

**Bonus — ${record.bonus.question}**
${options}

**Photo:** ${record.image.author} · ${record.image.licence} · [Commons](${record.image.descriptionUrl})
**Source:** ${record.sourceUrl}
`;
  });

  return header + "\n" + sections.join("\n---\n\n");
}
