import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xfdputlavvmrbpytzjtx.supabase.co'
const supabaseKey = 'sb_publishable_iEpt5rpQrHthojahxGOnLQ_LGv11J_o'
const supabase = createClient(supabaseUrl, supabaseKey)

async function findRecent() {
  const { data, error } = await supabase
    .from('extractions')
    .select('id, status, created_at, doc_type_final')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Error fetching extractions:', error)
    return
  }

  console.log('--- Recent Extractions ---')
  data.forEach(ex => {
    console.log(`ID: ${ex.id} | Status: ${ex.status} | Created: ${ex.created_at} | Type: ${ex.doc_type_final}`)
  })
}

findRecent()
