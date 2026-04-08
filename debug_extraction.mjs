import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xfdputlavvmrbpytzjtx.supabase.co'
const supabaseKey = 'sb_publishable_iEpt5rpQrHthojahxGOnLQ_LGv11J_o'
const supabase = createClient(supabaseUrl, supabaseKey)

const extractionId = '163d027b-994d-49c4-8169-ff1522727cb0'

async function debug() {
  const { data, error } = await supabase
    .from('extractions')
    .select('status, raw_extracted_json, doc_type_final, doc_type_detected')
    .eq('id', extractionId)
    .single()

  if (error) {
    console.error('Error fetching extraction:', error)
    return
  }

  console.log('--- Extraction Record ---')
  console.log('Status:', data.status)
  console.log('Type Final:', data.doc_type_final)
  console.log('Type Detected:', data.doc_type_detected)
  console.log('Owner Candidate:', data.raw_extracted_json?.owner_candidate)
  
  if (data.raw_extracted_json?.debug) {
    console.log('--- Debug Info ---')
    console.log('Dates:', data.raw_extracted_json.debug.dates)
    console.log('Owner Method:', data.raw_extracted_json.debug.ownerMethod)
    console.log('Validation Reasons:', data.raw_extracted_json.debug.owner?.validationReasons)
    
    if (data.raw_extracted_json.debug.owner?.selectedTokens) {
        console.log('Selected Tokens:', data.raw_extracted_json.debug.owner.selectedTokens)
    }

    if (data.raw_extracted_json.debug.owner?.labelCandidates) {
        console.log('Label Candidates:', data.raw_extracted_json.debug.owner.labelCandidates)
    }
  }
}

debug()
