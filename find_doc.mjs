import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xfdputlavvmrbpytzjtx.supabase.co'
const supabaseKey = 'sb_publishable_iEpt5rpQrHthojahxGOnLQ_LGv11J_o'
const supabase = createClient(supabaseUrl, supabaseKey)

async function findDoc() {
  const { data, error } = await supabase
    .from('employee_documents')
    .select('id, storage_path, original_filename, created_at')
    .ilike('original_filename', '%828f1252%')
    .limit(5)

  if (error) {
    console.error('Error fetching documents:', error)
    return
  }

  console.log('--- Found Documents ---')
  data.forEach(doc => {
    console.log(`ID: ${doc.id} | Path: ${doc.storage_path} | Filename: ${doc.original_filename} | Created: ${doc.created_at}`)
  })
}

findDoc()
