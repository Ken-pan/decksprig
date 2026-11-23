import type {CollectionId} from './template-collections';
import type {TableStyle} from './table-schema';

type Pair = [string, string];
type DecisionSample = {title: string; lead: string; context: string; points: Pair[]};
type TrendSample = {title: string; labels: string[]; series: string; values: number[]; forecastFrom?: number};
type StorySample = {decision: DecisionSample; caseStudy: Pair[]; trend: TrendSample; dashboard?: Pair[]};

export const LEDGER_METRIC_CELLS = [
  ['Metric','Previous','Current','Change'],
  ['Completion','42%','68%','+26 pp'],
  ['Response time','9 min','6 min','−3 min'],
  ['Active use','55%','62%','+7 pp'],
];
export const LEDGER_METRIC_STYLE: TableStyle = {
  preset:'editorial', headerRow:true, borders:'rows', verticalAlign:'middle', bodyFill:'transparent', padding:14,
  columnWidths:[1.55,1,1,1], columnAlign:['left','right','right','right'],
  cellStyles:LEDGER_METRIC_CELLS.map((_,row)=>({row,column:2,fontWeight:650})),
};
export const LEDGER_METRIC_SOURCE = 'Example data · Compare the same period, population and source';

/** Collection-specific examples for editable pages. Every value is illustrative. */
export const TEMPLATE_STORY_SAMPLES: Record<CollectionId, StorySample> = {
  portfolio: {
    trend: {title: 'More people finished the task', labels: ['Original', 'First pass', 'Second pass', 'Final'], series: 'Task completion', values: [42, 52, 60, 68]},
    decision: {
      title: 'What I’d refine next',
      lead: 'Make the next action visible.',
      context: 'A practical next iteration for the project.',
      points: [
        ['Keep', 'Preserve the short path to the most common task.'],
        ['Refine', 'Bring the next action closer to the result that triggers it.'],
        ['Validate', 'Watch first-time users finish the task without prompting.'],
      ],
    },
    caseStudy: [
      ['Challenge', 'People lost their place when switching from search to task detail.'],
      ['Contribution', 'I mapped the entry points and designed a consistent next action.'],
      ['Outcome', 'The revised flow made it easier to resume interrupted tasks.'],
      ['Evidence', 'Compare the same task in the original and redesigned flows.'],
    ],
  },
  review: {
    dashboard: [
      ['Completion', '68%\n70% gate · 2 pp short'],
      ['Active use', '62%\n65% target · 3 pp short'],
      ['Response time', '6 min\n7 min ceiling · 1 min under'],
      ['Quality', '94%\n95% target · 1 pp short'],
    ],
    trend: {title: 'The handoff test is nearing its gate', labels: ['Baseline', 'Round 1', 'Round 2', 'Latest'], series: 'Task completion', values: [42, 54, 62, 68]},
    decision: {
      title: 'Decision for this review',
      lead: 'Agree the next handoff test.',
      context: 'Owner: Product lead\nCheckpoint: Next team review',
      points: [
        ['Decision', 'Confirm a single owner on the active task.'],
        ['Evidence', 'The baseline task completion rate was 42%; the latest round reached 68%.'],
        ['Release gate', 'Reach 70% completion with the same task set and cohort.'],
      ],
    },
    caseStudy: [
      ['Observation', 'The next owner was unclear when an active task changed hands.'],
      ['Change', 'Show the named owner and expected handoff date.'],
      ['Outcome', 'Completion reached 68%, against a 70% release gate.'],
      ['Check', 'Repeat the task set with the same cohort before widening rollout.'],
    ],
  },
  proposal: {
    trend: {title: 'The direction became easier to recognize', labels: ['Initial', 'Type', 'Material', 'System'], series: 'Direction recall', values: [48, 55, 65, 74]},
    decision: {
      title: 'What we need to agree',
      lead: 'Confirm the direction and scope.',
      context: 'First milestone: A working identity across two applications.',
      points: [
        ['Direction', 'Approve the warm material palette and editorial type.'],
        ['Scope', 'Agree the two applications that will prove the system.'],
        ['Start', 'Book a working review with the client and delivery lead.'],
      ],
    },
    caseStudy: [
      ['Brief', 'Create a shared visual identity across print and digital.'],
      ['Direction', 'Use a warm palette, a restrained serif and measured spacing.'],
      ['Application', 'Test the same visual rules on a cover and a detail page.'],
      ['Review', 'Compare clarity and recognition across the two applications.'],
    ],
    dashboard: [
      ['Task completion', '68%\nTarget 80% · Baseline 42%'],
      ['Direction recall', '74%\nTarget 80% · After one day'],
      ['Application coverage', '2 of 3\nCover and detail page reviewed'],
      ['Review turnaround', '4 days\nTarget ≤5 days'],
      ['Print proofs', '2\nChecked at final size'],
      ['Revisions', '1\nRemaining before handoff'],
    ],
  },
  pitch: {
    trend: {title: 'More teams completed self-serve setup', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: 'Self-serve activation', values: [16, 27, 45, 61]},
    decision: {
      title: 'What the next round funds',
      lead: 'Get the product into more teams.',
      context: 'The next milestone is onboarding beyond the initial cohort.',
      points: [
        ['Support', 'Fund product onboarding and hands-on customer success.'],
        ['Use', 'Turn the assisted setup into a repeatable self-serve path.'],
        ['Milestone', 'Prove active use across the next customer cohort.'],
      ],
    },
    caseStudy: [
      ['Customer', 'A small operations team needed a single queue for urgent work.'],
      ['Product', 'One shared view brings work and ownership together.'],
      ['Traction', 'Example adoption grew from 29% to 68% over four quarters.'],
      ['Next proof', 'Track adoption in a second cohort after self-serve activation.'],
    ],
    dashboard: [
      ['Adoption', '68%\nUp from 29% in Q1'],
      ['Activation', '61%\nFirst task in the first week'],
      ['Active teams', '18\nAcross the initial cohort'],
      ['Repeat use', '72%\nReturned the following week'],
      ['Setup time', '7 min\nMedian for assisted setup'],
      ['Interviews', '12\nFrom the initial cohort'],
    ],
  },
  report: {
    trend: {title: 'Completion rose through the period', labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'], series: 'Completion', values: [32, 38, 42, 54, 62, 68]},
    decision: {
      title: 'Next quarter’s priority',
      lead: 'Close the completion gap.',
      context: 'Owner: Operations\nReview: Next month-end close',
      points: [
        ['Result', 'Completion reached 68%, two points below target.'],
        ['Action', 'Review the highest-volume unfinished task.'],
        ['Measure', 'Compare completion against the same 70% target.'],
      ],
    },
    caseStudy: [
      ['Measure', 'Completion means a task reached its agreed end state.'],
      ['Baseline', 'The previous period was 42% on the same definition.'],
      ['Result', 'Completion rose to 68%, two points below the target.'],
      ['Source', 'Use the same reporting period, cohort and activity records.'],
    ],
  },
  minimal: {
    trend: {title: 'The main idea became easier to identify', labels: ['Study 1', 'Study 2', 'Study 3', 'Next pass'], series: 'Identified the main idea', values: [41, 63, 79, 85], forecastFrom: 3},
    decision: {
      title: 'One thing to take forward',
      lead: 'Keep the element that gives the whole its shape.',
      context: 'Apply the same principle to the next iteration.',
      points: [
        ['Keep', 'One focal point and one clear hierarchy.'],
        ['Refine', 'Remove the element competing for attention.'],
        ['Check', 'Review the result at presentation size.'],
      ],
    },
    caseStudy: [
      ['Question', 'What can be removed without losing meaning?'],
      ['Study', 'Compare the same form at three levels of detail.'],
      ['Result', 'One continuous silhouette carries the idea.'],
      ['Next', 'Apply the same reduction to another composition.'],
    ],
    dashboard: [
      ['Focus', '1\nA single visual anchor'],
      ['Forms', '3\nCompare shape, scale and weight'],
      ['Directions', '2\nKeep a clear alternative'],
      ['Next pass', '1\nRefine the leading study'],
      ['Contrast levels', '2\nOne light and one dark'],
      ['Review sizes', '2\nThumbnail and presentation'],
    ],
  },
};
