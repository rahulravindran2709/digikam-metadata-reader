import { existsSync } from "fs";
import { copyFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { Bar } from "cli-progress";
import { bgGreenBright,greenBright } from 'cli-color'

type ImageResult = {
  name: string;
  path: string;
  destFolder: string;
};

const DRIVE_PATH = "/mnt/d";
const DATABASE_ROOT_FOLDER = "pics";
const DATABASE_NAME = "digikam4.db";
const OUTPUT_PARENT_DIRECTORY = "output";

const dbPath = resolve(DRIVE_PATH, DATABASE_ROOT_FOLDER, DATABASE_NAME);

const GET_BRIDE_TAG = "SELECT id from Tags WHERE name = 'bride'";
const GET_ACCEPTED_IMAGES_TAG =
  "SELECT id from Tags WHERE name = 'Pick Label Accepted'";
const GET_COMMON_TAG = "SELECT id from Tags WHERE name = 'common'";
const GET_GROOM_TAG = "SELECT id from Tags WHERE name = 'groom'";

const GET_BRIDE_ACCEPTED_IMAGES_QUERY = `SELECT * from ImageTags it1
JOIN Images i on it1.imageid = i.id 
JOIN Albums a ON a.id = i.album 
JOIN ImageTags it2 
ON it1.imageid = it2.imageid 
AND it1.tagid = ?1
AND it2.tagid = ?2`;
const GET_GROOM_ACCEPTED_IMAGES_QUERY = `SELECT * from ImageTags it1 
JOIN Images i on it1.imageid = i.id
JOIN Albums a ON a.id = i.album 
JOIN ImageTags it2 
ON it1.imageid = it2.imageid 
AND it1.tagid = ?1 
AND it2.tagid = ?2`;
const GET_COMMON_ACCEPTED_IMAGES_QUERY = `SELECT * from ImageTags it1 JOIN Images i 
ON it1.imageid = i.id 
JOIN Albums a 
ON a.id = i.album 
JOIN ImageTags it2
ON it1.imageid = it2.imageid 
AND it1.tagid = ?1 
AND it2.tagid = ?2`;

async function openDatabase(filePath: string) {
  const db = await open({
    filename: filePath,
    driver: sqlite3.Database,
  });
  return db;
}

function convertToFilePath(destFolder: string) {
  return function (obj: { name: string; relativePath: string }) {
    return {
      path: resolve(
        DRIVE_PATH,
        DATABASE_ROOT_FOLDER + obj.relativePath,
        obj.name
      ),
      name: obj.name,
      destFolder,
    };
  };
}

(async () => {
  try {
    const db = await openDatabase(dbPath);
    //Get tag ids for the bride groom common and accepted images tag
    const [bride, common, groom, accepted] = await Promise.all([
      db.get(GET_BRIDE_TAG),
      db.get(GET_COMMON_TAG),
      db.get(GET_GROOM_TAG),
      db.get(GET_ACCEPTED_IMAGES_TAG),
    ]);
    //Get all images which were approved and tagged as bride
    const results: ImageResult[][] = await Promise.all([
      db
        .all(GET_BRIDE_ACCEPTED_IMAGES_QUERY, {
          1: bride.id,
          2: accepted.id,
        })
        .then((v) => v.map(convertToFilePath("bride"))),
      //Get all images which were approved and tagged as groom
      db
        .all(GET_GROOM_ACCEPTED_IMAGES_QUERY, {
          1: groom.id,
          2: accepted.id,
        })
        .then((v) => v.map(convertToFilePath("groom"))),
      //Get all images which were approved and tagged as common
      db
        .all(GET_COMMON_ACCEPTED_IMAGES_QUERY, {
          1: common.id,
          2: accepted.id,
        })
        .then((v) => v.map(convertToFilePath("common"))),
    ]);
    // the bar value - will be linear incremented

    results.forEach(async (singleQResult) => {
      //Check if respective destination exists
      const destFolderComplete = resolve(
        DRIVE_PATH,
        OUTPUT_PARENT_DIRECTORY,
        singleQResult[0].destFolder
      );
      const exists = existsSync(destFolderComplete);
      // Create it if it doesnt
      if (!exists) {
        await mkdir(destFolderComplete, { recursive: true });
      }
      //Create a cli progress bar to show files being copied
      const b1 = new Bar({
        format: ` |- Copying file for ${singleQResult[0].destFolder}: {percentage}%   -   ||{bar}||`,
        stopOnComplete: true,
      });
      b1.start(singleQResult.length, 0);

      let value = 0;
      //Copy each file to their respective destination
      singleQResult.forEach(async (fileName, index) => {
        await copyFile(fileName.path, destFolderComplete + "/" + fileName.name);
        value++;
        b1.update(value);
      });
    });
  } catch (e) {
    console.error(e);
  }
})();
