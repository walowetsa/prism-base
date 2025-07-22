import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import ProcessedCallRecord from '@/types/ProcessedCallRecord'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('call_records') 
      .select(`contact_id, recording_location, transcript_text, queue_name, agent_username, initiation_timestamp, sentiment_analysis, categories, disposition_title, call_summary, call_duration, primary_category`)
      .order('initiation_timestamp', { ascending: false })

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch call records', details: error.message },
        { status: 500 }
      )
    }
    const callRecords: ProcessedCallRecord[] = data || []

    return NextResponse.json({
      data: callRecords
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}