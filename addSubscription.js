/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict'

const composer = require('@ibm-functions/composer')

const dbname = 'travis2slack'
const cloudantBinding = process.env['CLOUDANT_PACKAGE_BINDING'];
const slackConfig = {
  token: process.env['SLACK_TOKEN'],
  username: 'whiskbot',
  url: 'https://slack.com/api/chat.postMessage'
}

if (slackConfig.token === undefined) {
  console.error('SLACK_TOKEN required in environment.')
  process.exit(-1)
}

if (cloudantBinding === undefined) {
  console.error('CLOUDANT_PACKAGE_BINDING required in environment.')
  process.exit(-1)
}

module.exports = composer.let({ db: dbname, sc: slackConfig, userID: null, name: null, response: null },
  composer.sequence(
    `/whisk.system/utils/echo`,
    p => { name = p.text; docId = p.text.trim().toUpperCase(); userID = p.user_id },
    composer.if(
      _ => docId === "",
      _ => { response = "Usage: /subscribe-travis \"YOUR NAME HERE\"" },
      composer.sequence(
        composer.try(
          composer.sequence(
            // Attempt to write the document describing the subscription to the database
            _ => ({ dbname: db, doc: { _id: docId, display_name: name, userID: userID, onSuccess: true }, overwrite: false }),
            `${cloudantBinding}/write`,
            _ => { response = "Hi, " + name + ". I will now notify you when TravisCI jobs for your Apache OpenWhisk PRs complete." }
          ),
          // write failed.  Try to figure out why
          composer.try(
            // First, check to see document with same docId already exists. Duplicate subscription!
            composer.sequence(
              p => ({ dbname: db, docid: docId }),
              `${cloudantBinding}/read-document`,
              doc => { response = "I'm sorry, but <@" + doc.userID + "> is already subscribed to be notified for PRs by `" + name + "`" }
            ),
            // Something else went wrong with the write; ask user to try again later.
            _ => { response = "I'm sorry. There was an error updating Cloudant. Try again later." }
          )
        )
      )
    ),
    // Post the final result of the subscription request back to the user via slack.
    _ => Object.assign(sc, { channel: "@" + userID, text: response }),
    `/whisk.system/slack/post`
  ))
