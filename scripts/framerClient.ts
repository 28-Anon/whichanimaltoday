import { connect } from "framer-api";
import { readTextField, readImageField } from "./fieldValue";

export interface ArchivableAnimal {
  commonName: string;
  imageUrl: string;
  funFacts: string;
  category: string;
  imageAttribution: string;
}

export function mapFieldDataToAnimal(
  fieldData: Record<string, unknown>
): ArchivableAnimal {
  return {
    commonName: readTextField(fieldData, "commonName"),
    imageUrl: readImageField(fieldData, "image"),
    funFacts: readTextField(fieldData, "funFacts"),
    category: readTextField(fieldData, "category"),
    imageAttribution: readTextField(fieldData, "imageAttribution"),
  };
}

export interface FramerField {
  id: string;
  name: string;
}

export function remapFieldDataByName(
  fieldData: Record<string, unknown>,
  fields: FramerField[]
): Record<string, unknown> {
  const byName: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.id in fieldData) {
      byName[field.name] = fieldData[field.id];
    }
  }
  return byName;
}

interface FramerCollection {
  name: string;
  getFields(): Promise<FramerField[]>;
  getItems(): Promise<Array<{ fieldData: Record<string, unknown> }>>;
}

interface FramerConnection {
  getCollections(): Promise<FramerCollection[]>;
}

export async function fetchAnimalsFromFramer(
  projectUrl: string,
  apiKey: string,
  collectionName: string
): Promise<ArchivableAnimal[]> {
  const framer = (await connect(projectUrl, apiKey)) as FramerConnection;
  const collections = await framer.getCollections();
  const collection = collections.find((c) => c.name === collectionName);

  if (!collection) {
    throw new Error(
      `Collection "${collectionName}" not found in this Framer project`
    );
  }

  const fields = await collection.getFields();
  const items = await collection.getItems();

  return items.map((item) => {
    const namedFieldData = remapFieldDataByName(item.fieldData, fields);
    return mapFieldDataToAnimal(namedFieldData);
  });
}
