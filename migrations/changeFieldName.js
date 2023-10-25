import {createClient} from '@sanity/client'

const token = process.env.SANITY_STUDIO_PROJECT_TOKEN
const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_PROJECT_DATASET
const apiVersion = '2023-03-01'

const client = createClient({
  apiVersion,
  projectId,
  dataset,
  token,
  useCdn: false,
})

// Run this script from within your project folder in your terminal with: `sanity exec migrations/changeFieldName.js`
//
// This example shows how you may write a migration script that renames a field (namefield => name)
// on a specific document type (author).
// given the fact that you already changed the in your author schema that's in author.js

// from namefield
// defineField({
//     name: 'namefield',

// to name
// defineField({
//     name: 'name',

// and you want to keep the data as it is
// This will migrate documents in batches of 100 and continue patching until no more documents are
// returned from the query.

// This script can safely be run, even if documents are being concurrently modified by others.
// If a document gets modified in the time between fetch => submit patch, this script will fail,
// but can safely be re-run multiple times until it eventually runs out of documents to migrate.

// A few things to note:
// - This script will exit if any of the mutations fail due to a revision mismatch (which means the
//   document was edited between fetch => update)
// - The query must eventually return an empty set, or else this script will continue indefinitely

// Fetching documents that matches the precondition for the migration.
// NOTE: This query should eventually return an empty set of documents to mark the migration
// as complete
const fetchDocuments = () =>
  client.fetch(`*[_type == 'post' && defined(body)][0...100] {_id, _rev, body}`)

const buildPatches = (docs) =>
  docs.map((doc) => {
    return {
      id: doc._id,
      patch: {
        set: {excerpt: doc.body},
        unset: ['body'],
        // this will cause the transaction to fail if the documents has been
        // modified since it was fetched.
        ifRevisionID: doc._rev,
      },
    }
  })

const createTransaction = (patches) =>
  patches.reduce((tx, patch) => tx.patch(patch.id, patch.patch), client.transaction())

const commitTransaction = (tx) => tx.commit()

const migrateNextBatch = async () => {
  const documents = await fetchDocuments()
  const patches = buildPatches(documents)
  if (patches.length === 0) {
    console.log('No more documents to migrate!')
    return null
  }
  console.log(
    `Migrating batch:\n %s`,
    patches.map((patch) => `${patch.id} => ${JSON.stringify(patch.patch)}`).join('\n'),
  )
  const transaction = createTransaction(patches)
  await commitTransaction(transaction)
  return migrateNextBatch()
}

migrateNextBatch().catch((err) => {
  console.error(err)
  process.exit(1)
})
