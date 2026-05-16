// Supabase Edge Function — generate-signal
// Checks the ai_signals cache for a fresh entry; generates a new one via
// Claude Sonnet if stale or absent. Runs with the caller's JWT so RLS
// enforces pet ownership on every query.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYMPTOM_TYPES = ['vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'lethargy']

interface EventRow {
  id: string
  event_type: string
  occurred_at: string
  severity: number | null
}

interface MealRow {
  event_id: string
  food_items: { brand: string; product_name: string } | null
}

interface DietTrialRow {
  started_at: string
  target_duration_days: number
  food_items: { brand: string; product_name: string } | null
}

interface ConditionRow {
  condition_name: string
  status: string
}

interface PetRow {
  name: string
  species: string
  breed: string | null
}

interface Correlation {
  symptomType: string
  foodBrand: string
  foodName: string
  count: number
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { petId } = await req.json() as { petId: string }
    if (!petId || typeof petId !== 'string') {
      return Response.json({ error: 'petId required' }, { status: 400, headers: CORS_HEADERS })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    // 1. Check fresh cache
    const { data: cached } = await supabase
      .from('ai_signals')
      .select('signal_text, is_building')
      .eq('pet_id', petId)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cached) {
      return Response.json(
        { signal_text: cached.signal_text, is_building: cached.is_building },
        { headers: CORS_HEADERS },
      )
    }

    // 2. Fetch pet info and data in parallel
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const [petResult, eventsResult, conditionsResult, dietTrialResult] = await Promise.all([
      supabase
        .from('pets')
        .select('name, species, breed')
        .eq('id', petId)
        .single<PetRow>(),

      supabase
        .from('events')
        .select('id, event_type, occurred_at, severity')
        .eq('pet_id', petId)
        .is('deleted_at', null)
        .gte('occurred_at', fourteenDaysAgo.toISOString())
        .order('occurred_at', { ascending: false })
        .returns<EventRow[]>(),

      supabase
        .from('conditions')
        .select('condition_name, status')
        .eq('pet_id', petId)
        .in('status', ['active', 'monitoring'])
        .returns<ConditionRow[]>(),

      supabase
        .from('diet_trials')
        .select('started_at, target_duration_days, food_items(brand, product_name)')
        .eq('pet_id', petId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle<DietTrialRow>(),
    ])

    const pet = petResult.data
    const events = eventsResult.data ?? []
    const conditions = conditionsResult.data ?? []
    const dietTrial = dietTrialResult.data ?? null

    // 3. If no events at all, return building copy without calling Claude
    if (events.length === 0) {
      const buildingText = pet
        ? `We're getting to know ${pet.name}. Keep logging and patterns start appearing in about a week.`
        : `We're building a picture of your pet's health. Keep logging and patterns will start appearing soon.`

      await supabase.from('ai_signals').insert({
        pet_id: petId,
        signal_text: buildingText,
        is_building: true,
      })

      return Response.json(
        { signal_text: buildingText, is_building: true },
        { headers: CORS_HEADERS },
      )
    }

    // 4. Fetch meal food details for correlation
    const mealEventIds = events.filter(e => e.event_type === 'meal').map(e => e.id)
    const mealsResult = mealEventIds.length > 0
      ? await supabase
          .from('meals')
          .select('event_id, food_items(brand, product_name)')
          .in('event_id', mealEventIds)
          .returns<MealRow[]>()
      : { data: [] as MealRow[] }

    const meals = mealsResult.data ?? []
    const mealFoodMap = new Map(meals.map(m => [m.event_id, m.food_items]))

    // 5. Build correlation pairs (meals eaten within 8h before a symptom)
    const symptomEvents = events.filter(e => SYMPTOM_TYPES.includes(e.event_type))
    const mealEvents = events.filter(e => e.event_type === 'meal')

    const pairCounts = new Map<string, Correlation>()
    for (const symptom of symptomEvents) {
      const symptomMs = new Date(symptom.occurred_at).getTime()
      for (const meal of mealEvents) {
        const mealMs = new Date(meal.occurred_at).getTime()
        const hoursGap = (symptomMs - mealMs) / 3_600_000
        if (hoursGap < 0 || hoursGap > 8) continue
        const food = mealFoodMap.get(meal.id)
        if (!food) continue
        const key = `${symptom.event_type}|${food.brand}|${food.product_name}`
        const existing = pairCounts.get(key)
        if (existing) {
          existing.count++
        } else {
          pairCounts.set(key, {
            symptomType: symptom.event_type,
            foodBrand: food.brand,
            foodName: food.product_name,
            count: 1,
          })
        }
      }
    }
    const topCorrelations = Array.from(pairCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)

    // 6. Diet trial compliance (days with meals since trial started)
    let trialContext: { foodName: string | null; daysElapsed: number; targetDays: number; compliantDays: number } | null = null
    if (dietTrial) {
      const startISO = new Date(dietTrial.started_at).toISOString().split('T')[0]
      const daysElapsed = Math.max(
        1,
        Math.floor((Date.now() - new Date(dietTrial.started_at).getTime()) / 86_400_000),
      )
      const compliantDays = new Set(
        events
          .filter(e => e.event_type === 'meal' && e.occurred_at >= startISO)
          .map(e => e.occurred_at.split('T')[0]),
      ).size

      trialContext = {
        foodName: dietTrial.food_items
          ? `${dietTrial.food_items.brand} ${dietTrial.food_items.product_name}`
          : null,
        daysElapsed,
        targetDays: dietTrial.target_duration_days,
        compliantDays,
      }
    }

    // 7. Symptoms before vs after trial start (gives Claude trend context)
    const trialStartISO = dietTrial?.started_at ?? null
    const symptomsBeforeTrial = trialStartISO
      ? symptomEvents.filter(e => e.occurred_at < trialStartISO).length
      : null
    const symptomsAfterTrial = trialStartISO
      ? symptomEvents.filter(e => e.occurred_at >= trialStartISO).length
      : null

    // 8. Build event count summary
    const eventCounts: Record<string, number> = {}
    for (const e of events) {
      eventCounts[e.event_type] = (eventCounts[e.event_type] ?? 0) + 1
    }

    // 9. Build prompt
    const prompt = buildPrompt({
      pet: pet ?? { name: 'your pet', species: 'unknown', breed: null },
      conditions,
      trialContext,
      symptomsBeforeTrial,
      symptomsAfterTrial,
      eventCounts,
      topCorrelations,
    })

    // 10. Call Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeRes.ok) {
      throw new Error(`Claude API error: ${claudeRes.status}`)
    }

    const claudeData = await claudeRes.json() as {
      content: Array<{ type: string; text: string }>
    }
    const signalText = claudeData.content[0]?.text?.trim() ?? ''

    if (!signalText) throw new Error('Empty response from Claude')

    // 11. Cache the result
    await supabase.from('ai_signals').insert({
      pet_id: petId,
      signal_text: signalText,
      is_building: false,
    })

    return Response.json(
      { signal_text: signalText, is_building: false },
      { headers: CORS_HEADERS },
    )
  } catch (err) {
    console.error('generate-signal error:', err)
    return Response.json(
      { error: 'Signal generation failed' },
      { status: 500, headers: CORS_HEADERS },
    )
  }
})

function buildPrompt(params: {
  pet: PetRow
  conditions: ConditionRow[]
  trialContext: { foodName: string | null; daysElapsed: number; targetDays: number; compliantDays: number } | null
  symptomsBeforeTrial: number | null
  symptomsAfterTrial: number | null
  eventCounts: Record<string, number>
  topCorrelations: Correlation[]
}): string {
  const { pet, conditions, trialContext, symptomsBeforeTrial, symptomsAfterTrial, eventCounts, topCorrelations } = params
  const lines: string[] = []

  lines.push(`Pet: ${pet.name} (${pet.species}${pet.breed ? ', ' + pet.breed : ''})`)

  if (conditions.length > 0) {
    lines.push(`Known conditions: ${conditions.map(c => `${c.condition_name} (${c.status})`).join(', ')}`)
  }

  if (trialContext) {
    const foodPart = trialContext.foodName ? ` on ${trialContext.foodName}` : ''
    lines.push(
      `Active elimination diet trial${foodPart}: Day ${trialContext.daysElapsed} of ${trialContext.targetDays}.` +
      ` ${trialContext.compliantDays} of ${trialContext.daysElapsed} days with meals logged.`,
    )
    if (symptomsBeforeTrial !== null && symptomsAfterTrial !== null) {
      lines.push(
        `Symptom events before trial: ${symptomsBeforeTrial}. Symptom events since trial started: ${symptomsAfterTrial}.`,
      )
    }
  }

  lines.push('')
  lines.push('Events logged in the last 14 days:')
  const eventEntries = Object.entries(eventCounts).filter(([, n]) => n > 0)
  if (eventEntries.length === 0) {
    lines.push('- None')
  } else {
    for (const [type, count] of eventEntries) {
      lines.push(`- ${type}: ${count} occurrence${count !== 1 ? 's' : ''}`)
    }
  }

  if (topCorrelations.length > 0) {
    lines.push('')
    lines.push('Meal–symptom correlations (meals eaten within 8h before a symptom event):')
    for (const c of topCorrelations) {
      lines.push(
        `- ${c.symptomType} occurred after ${c.foodBrand} ${c.foodName} on ${c.count} occasion${c.count !== 1 ? 's' : ''}`,
      )
    }
  }

  lines.push('')
  lines.push(`Generate exactly ONE sentence of health insight for ${pet.name}'s owner. Rules:`)
  lines.push(`- Use ${pet.name}'s name, not "your pet"`)
  lines.push('- Be specific: cite numbers, food names, or trends from the data above')
  lines.push('- Warm but clinical in tone — like a caring friend who knows veterinary medicine')
  lines.push('- If a pattern is clear and consistent, state it confidently')
  lines.push('- If the data is too sparse or mixed for a meaningful pattern, describe what IS present honestly')
  lines.push('- No alarm language before data justifies clinical concern')
  lines.push('- No exclamation marks')
  lines.push('- Output ONLY the sentence, nothing else')

  return lines.join('\n')
}
