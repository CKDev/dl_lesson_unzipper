// dependencies
var AdmZip = require("adm-zip");
var mime = require("mime-types");
var AWS = require("aws-sdk");
var Rollbar = require("rollbar");

// get reference to S3 client
var s3 = new AWS.S3();

// configure rollbar
var rollbar = new Rollbar({
  accessToken: process.env.ROLLBAR_TOKEN,
  environment: process.env.ROLLBAR_ENV,
  captureLambdaTimeouts: false,
});

exports.handler = rollbar.lambdaHandler((event, context, callback) => {
  var srcBucket = event.Records[0].s3.bucket.name;

  var environment = getEnvironmentFromBucketName(srcBucket);

  Rollbar.global({
    payload: {
      environment: environment,
    },
  });

  // Object key may have spaces or unicode non-ASCII characters.
  var srcKey = decodeURIComponent(
    event.Records[0].s3.object.key.replace(/\+/g, " ")
  );
  var dstBucket = srcBucket.replace("-zipped", "");

  rollbar.log("Attempting to process lesson: " + srcKey + " from " + srcBucket);
  console.log("Attempting to process lesson: " + srcKey + " from " + srcBucket);

  processLesson(srcBucket, srcKey, dstBucket)
    .then(function () {
      console.log("Lesson successfully unzipped and uploaded.");
    })
    .catch(function (err) {
      rollbar.error("Error processing lesson: " + srcKey + " - " + err);
      console.error("Could not finish lesson processing: " + err);
    });
});

async function processLesson(srcBucket, srcKey, dstBucket) {
  try {
    var s3Response = await getZippedLesson(srcBucket, srcKey);
    console.log("Zipped lesson downloaded");
  } catch (err) {
    throw new Error(
      "Unable to fetch " + srcBucket + "/" + srcKey + " from s3: " + err
    );
  }

  try {
    var unzippedLesson = await unzip(s3Response.Body);
  } catch (err) {
    throw new Error("Unable to unzip lesson: " + err);
  }

  try {
    var fixedLessonFiles = await fixLessonJs(unzippedLesson);
  } catch (err) {
    throw new Error("Unable to fix lesson javascript: " + err);
  }

  for (let i = 0; i < fixedLessonFiles.length; i++) {
    try {
      await uploadLesson(fixedLessonFiles[i], dstBucket, srcKey);
    } catch (err) {
      throw new Error("Unable to upload new lesson: " + err);
    }
  }
}

async function getZippedLesson(srcBucket, srcKey) {
  const params = {
    Bucket: srcBucket,
    Key: srcKey,
  };

  return await s3.getObject(params).promise();
}

async function unzip(zippedLesson) {
  var zip = AdmZip(zippedLesson);
  var zipEntries = zip.getEntries();

  return zipEntries;
}

async function fixLessonJs(files) {
  return files.map((file) => {
    var contents;

    if (file.entryName.match("user.js")) {
      let fileString = file.getData().toString();
      let oldEventString = "window.parent.sendLessonCompletedEvent()";
      let newEventString = 'window.parent.postMessage("lesson_completed", "*")';
      let dlcTransitionString = "getDLCTransition('lesson')";
      fileString = fileString
        .replace(oldEventString, newEventString)
        .replace(dlcTransitionString, newEventString);

      contents = Buffer.from(fileString);
    } else {
      contents = file.getData();
    }

    return {
      name: file.entryName,
      contents: contents,
    };
  });
}

async function uploadLesson(lesson, bucket, srcKey) {
  let key = srcKey.replace(".zip", "") + "/" + lesson.name;

  let properties = {
    Bucket: bucket,
    Key: key,
    Body: lesson.contents,
    ACL: "private",
    ContentDisposition: "inline",
  };

  var splitKey = key.split(".");
  var extension = splitKey[splitKey.length - 1];

  properties.ContentType = mime.lookup(extension);

  return await s3.putObject(properties).promise();
}

function getEnvironmentFromBucketName(bucketName) {
  if (bucketName.includes("stageapp") || bucketName.includes("staging")) {
    return "staging";
  } else {
    return "production";
  }
}
