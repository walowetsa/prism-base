// app/api/supabase/call-logs/[contact_id]/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import CallRecord from '@/types/CallRecord'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(
  request: Request,
  { params }: { params: { contact_id: string } }
) {
  try {
    const { contact_id } = params

    if (!contact_id) {
      return NextResponse.json(
        { error: 'Contact ID is required' },
        { status: 400 }
      )
    }

    // Fetch all columns for the specific call record
    const { data, error } = await supabase
      .from('call_records')
      .select('*') // Select all columns
      .eq('contact_id', contact_id)
      .single() // Get single record

    if (error) {
      console.error('Supabase error:', error)
      
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Call record not found' },
          { status: 404 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch call record', details: error.message },
        { status: 500 }
      )
    }

    const callRecord: CallRecord = data

    return NextResponse.json({
      data: callRecord
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}