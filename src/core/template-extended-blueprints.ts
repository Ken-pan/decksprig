import type {TemplatePage} from './template-blueprints';
import type {CollectionId} from './template-collections';

type Pair=[string,string];
type Topic={agenda:Pair[];audience:Pair[];insights:Pair[];solution:Pair[];milestones:Pair[];team:Pair[];risks:Pair[];takeaways:Pair[];questions:Pair[];titles:string[]};
/** Genre-specific prompts keep the new pages useful even when the visual pattern is shared. */
const topics:Record<CollectionId,Topic>={
  portfolio:{
    titles:['Inside the project.','From insight to outcome.','Where the friction starts.','The people I designed for.','Three things that changed my mind.','How the experience fits together.','From exploration to craft.','The project in time.','A shared effort.','What still needs work.','The lessons worth carrying.','Let’s talk about the work.'],
    agenda:[['Context','Audience, scope, and challenge'],['Discovery','Research and design decisions'],['Outcome','The work, its impact, and lessons']],
    audience:[['Context','Where does the task happen?'],['Need','What is the person trying to do?'],['Friction','What gets in their way?']],
    insights:[['Behavior','What people actually did'],['Tension','Where expectations broke down'],['Opportunity','What the design could change']],
    solution:[['Entry','Help people find a starting point'],['Core task','Make the next action clear'],['Feedback','Show progress and the outcome']],
    milestones:[['Discover','Frame the question'],['Explore','Compare directions'],['Validate','Test the critical task'],['Deliver','Ship and learn']],
    team:[['Design','Your contribution and decisions'],['Product','Goals and prioritization'],['Engineering','Implementation and delivery']],
    risks:[['Evidence gap','What still needs validation?'],['Dependency','What relies on another team?'],['Next release','What would you improve first?']],
    takeaways:[['Impact','What changed for the audience'],['Craft','Which decision made a difference'],['Reflection','What you would do differently']],
    questions:[['Decisions','Which tradeoff would you like to discuss?'],['Evidence','What would you test next?'],['Learning','How could this apply elsewhere?']],
  },
  review:{
    titles:['The review, in order.','The next review.','The issue beneath the symptom.','Who the decision affects.','What we know so far.','The proposed experience.','The states that matter.','From decision to release.','Clear ownership.','What could change the plan.','What this review establishes.','What should we decide?'],
    agenda:[['Context','The problem and boundary'],['Evidence','Findings, options, and proposal'],['Decision','Success criteria and next steps']],
    audience:[['Primary user','Who performs the task?'],['Stakeholder','Who is affected by the outcome?'],['Constraint','What context must we respect?']],
    insights:[['Observed','What the evidence supports'],['Inferred','What we think it means'],['Unknown','What needs a focused test']],
    solution:[['Start','Set the task and expectation'],['Action','Support the critical decision'],['Recovery','Help people handle an exception']],
    milestones:[['Align','Confirm the direction'],['Prototype','Build the riskiest part'],['Test','Review evidence'],['Release','Meet the release gate']],
    team:[['Decision owner','Who approves the direction?'],['Delivery owner','Who coordinates the work?'],['Validation owner','Who checks the outcome?']],
    risks:[['Usability','Which task may still be difficult?'],['Feasibility','Which dependency is unresolved?'],['Scope','What could expand the work?']],
    takeaways:[['Finding','What the evidence tells us'],['Recommendation','Which direction we propose'],['Decision','What we need from this review']],
    questions:[['Direction','Is this the right approach?'],['Risk','What should we validate first?'],['Commitment','Who takes the next step?']],
  },
  proposal:{
    titles:['A considered proposal.','From direction to delivery.','The gap we can close.','A direction for the audience.','The rationale, distilled.','A coherent design system.','Three studies, one direction.','A measured path to delivery.','The people making it happen.','Conditions for good work.','Why this direction works.','Let’s refine the brief.'],
    agenda:[['Brief','Audience, objectives, and scope'],['Direction','Principle, rationale, and studies'],['Delivery','Plan, responsibility, and approval']],
    audience:[['Purpose','What should the audience feel or do?'],['Context','Where will they encounter the work?'],['Expectation','What makes the direction appropriate?']],
    insights:[['Audience','A need the direction responds to'],['Identity','A quality worth making distinctive'],['Use','A constraint that shapes the system']],
    solution:[['Foundation','Color, typography, and spacing'],['Expression','Images and visual language'],['Application','The direction in real contexts']],
    milestones:[['Brief','Agree the objective'],['Concept','Review the direction'],['Refine','Resolve the details'],['Handoff','Deliver the system']],
    team:[['Creative lead','Direction and design decisions'],['Project lead','Scope, schedule, and reviews'],['Client partner','Context and final approval']],
    risks:[['Inputs','What must be ready before design?'],['Review','What needs an approval date?'],['Production','Which constraint needs testing?']],
    takeaways:[['Fit','Why it serves the audience'],['Clarity','What makes the direction coherent'],['Delivery','How we make it achievable']],
    questions:[['Direction','Does this express the right qualities?'],['Scope','Are the deliverables clear?'],['Timing','When can we begin?']],
  },
  pitch:{
    titles:['The opportunity ahead.','The next chapter.','The cost of the current way.','A focused first customer.','Why this opportunity matters.','One product, a clear value chain.','The product in practice.','Milestones that unlock growth.','The team we’re building.','What we need to prove.','A focused case for support.','Let’s discuss the opportunity.'],
    agenda:[['Opportunity','Customer, problem, and timing'],['Product','Solution, proof, and economics'],['Execution','Team, milestones, and the ask']],
    audience:[['Buyer','Who controls the purchase?'],['User','Who experiences the value?'],['First market','Where can we win first?']],
    insights:[['Demand','What signals a real need'],['Timing','What has changed in the market'],['Advantage','What makes the approach credible']],
    solution:[['Discover','Reach the right customer'],['Deliver','Create the promised value'],['Expand','Build a reason to return']],
    milestones:[['Validate','Prove the customer need'],['Launch','Deliver the core product'],['Grow','Repeat the acquisition path'],['Scale','Improve the economics']],
    team:[['Now','The capability already in place'],['Next hire','The expertise we need next'],['Partners','Who helps us reach the market']],
    risks:[['Demand','Which assumption needs evidence?'],['Economics','Which cost must improve?'],['Execution','Which dependency limits growth?']],
    takeaways:[['Need','A specific customer problem'],['Proof','Evidence that the approach works'],['Ask','Support tied to a clear milestone']],
    questions:[['Market','Where should we focus first?'],['Proof','What evidence would you want next?'],['Support','How could we work together?']],
  },
  report:{
    titles:['A guide to the report.','Interpretation and action.','Where performance falls short.','Who the numbers represent.','What explains the change.','From finding to action.','Evidence from the period.','The reporting period.','Owners of the next action.','Limits and uncertainties.','Three takeaways.','Questions for the next review.'],
    agenda:[['Overview','Findings, scope, and performance'],['Analysis','Details, comparisons, and context'],['Action','Priorities, owners, and next review']],
    audience:[['Population','Who is included in the data?'],['Period','Which dates are comparable?'],['Exclusions','Who or what is not represented?']],
    insights:[['Pattern','What changed across the period'],['Driver','What may explain the movement'],['Limit','What the data cannot establish']],
    solution:[['Diagnose','Confirm the source of the change'],['Act','Choose a focused intervention'],['Measure','Check the next comparable period']],
    milestones:[['Start','Record the baseline'],['Checkpoint','Review early movement'],['Close','Verify the period’s result'],['Review','Agree next actions']],
    team:[['Metric owner','Definition and data quality'],['Action owner','Delivery and progress'],['Review owner','Decision and follow-up']],
    risks:[['Coverage','Which data may be incomplete?'],['Comparability','Which definition changed?'],['Attribution','Which other factor may explain it?']],
    takeaways:[['Result','The most important change'],['Context','The evidence behind it'],['Action','The priority for the next period']],
    questions:[['Evidence','What needs deeper analysis?'],['Priority','Which action has the greatest value?'],['Review','When should we assess progress?']],
  },
  minimal:{
    titles:['The story ahead.','The core idea.','A problem worth solving.','Start with the audience.','What we learned.','How the parts fit.','Three perspectives.','A clear sequence.','People and responsibilities.','What needs attention.','What matters most.','Open for discussion.'],
    agenda:[['Context','The subject and the audience'],['Idea','Evidence and the approach'],['Action','Priorities and the next step']],
    audience:[['Who','The people at the center'],['Need','The outcome they seek'],['Context','The conditions that matter']],
    insights:[['Observation','What you found'],['Meaning','Why it matters'],['Implication','What it changes']],
    solution:[['Input','What the approach starts with'],['Work','How it creates value'],['Outcome','What becomes possible']],
    milestones:[['Begin','Set the objective'],['Explore','Find the direction'],['Build','Make the idea concrete'],['Review','Learn from the outcome']],
    team:[['Lead','Direction and decisions'],['Delivery','Implementation and coordination'],['Review','Quality and follow-up']],
    risks:[['Assumption','What must be true?'],['Dependency','What needs to happen first?'],['Constraint','What limits the approach?']],
    takeaways:[['One','The central idea'],['Two','The evidence that supports it'],['Three','The next useful action']],
    questions:[['Clarify','What needs more explanation?'],['Explore','What should we examine next?'],['Act','What can we agree today?']],
  },
};
const ids=['agenda','section','problem','audience','insights','solution','gallery','timeline','team','risks','summary','q-and-a'] as const;
const names=['Contents','Section divider','Problem framing','Audience','Key insights','Solution overview','Visual studies','Milestones','People and ownership','Risks and dependencies','Takeaways','Questions'];
const purposes=['Orient the audience to the story and its sections','Introduce a new chapter and its central reader question','Explain the current friction, consequence, and opportunity','Define the audience and the context of their needs','Distill the evidence into useful observations and implications','Explain how three parts of the approach create value','Show three studies with their rationale and context','Make four milestones, outputs, and checkpoints explicit','Assign responsibilities and make handoffs clear','Pair each uncertainty with a mitigation and an owner','Connect the main finding to its evidence and next action','Invite a focused discussion around open questions'];

export function extendedBlueprints(id:CollectionId):Record<string,TemplatePage>{
  const t=topics[id],fields=[t.agenda,t.agenda,[['Friction','Describe the current difficulty'],['Consequence','Explain its practical cost'],['Opportunity','Name the change worth making']] as Pair[],t.audience,t.insights,t.solution,t.solution,t.milestones,t.team,t.risks,t.takeaways,t.questions];
  const out:Record<string,TemplatePage>={};
  ids.forEach((key,i)=>{out[key]={name:names[i],section:names[i],heading:t.titles[i],body:i===1?'Add a short introduction to this chapter.':i===2?'Describe the situation in one clear sentence.':'',purpose:purposes[i],fields:fields[i],columns:fields[i]};});
  if(id==='minimal'){
    out.gallery={...out.gallery,heading:'Three ways to shape a plane.',fields:[['Fold','One continuous edge'],['Balance','A deliberate shift in weight'],['Void','An opening shapes the whole']]};
  }
  if(id==='report')out.gallery={...out.gallery,name:'Supporting charts',fields:[['Completion','42% → 68% over the period'],['Active use','55% → 62% for the same population'],['Trend','29% → 68% across four quarters']],purpose:'Compare supporting metrics with editable example data'};
  if(id==='pitch')out.gallery={...out.gallery,name:'Product states',fields:[['Starting point','Show how the customer begins'],['Core task','Demonstrate the critical action'],['Outcome','Make the delivered value visible']],purpose:'Explain three product states with editable interface examples'};
  // Original patterns not present in the shorter collections now have native,
  // genre-specific copy rather than inheriting portfolio prompts.
  Object.assign(out,{
    cover:{name:'Cover',section:'Introduction',heading:'A clear\nidea.',body:'Presentation title\nYour name · Date',purpose:'Introduce the subject, author, and occasion'},
    statement:{name:'Key message',section:'The point',heading:id==='report'?'The result that\nchanges the plan.':id==='review'?'A decision grounded\nin evidence.':'Only what\nmatters.',body:'State the central idea in one sentence.',purpose:'Give the central idea enough space to be understood'},
    facts:{name:'Context',section:'Context',heading:'The essentials.',body:'Explain the subject, scope, and intended outcome.',purpose:'Establish the scope, objective, and constraints',fields:[['Objective','What should change?'],['Scope','What is included?'],['Boundary','What is outside the work?']]},
    split:{name:id==='report'?'Analysis and evidence':'Visual language',section:id==='report'?'Evidence':'Concept study',heading:id==='report'?'A finding, in context.':'Balance. Space. Form.',body:id==='report'?'Describe the pattern and the evidence that supports it.':'An AI concept study of balance, space and form. Explain the visual direction and its intended effect.',purpose:'Connect one important finding to its supporting evidence'},
    'before-after':{name:'Before and after',section:'Comparison',heading:'A change you can see.',body:'Compare the same subject, scale, and context.',purpose:'Make the effect of a change easy to evaluate'},
    process:{name:'Process',section:'Approach',heading:id==='report'?'How the data becomes a decision.':'A clear path through.',body:'',purpose:'Explain the steps and the output of each stage',columns:t.solution},
    evidence:{name:id==='pitch'?'Product evidence':id==='review'?'Evidence detail':'Evidence detail',section:'The detail',heading:id==='pitch'?'Proof in the product.':id==='review'?'Look closely at the evidence.':id==='minimal'?'Space and\ncontrast.':'Make room\nfor the detail.',body:id==='minimal'?'An AI concept study. Inspect rhythm, contrast and the effect of negative space.':'Explain the source, context, and significance of the evidence.',purpose:'Let the audience inspect the evidence at a useful scale'},
    metrics:{name:id==='proposal'?'Measures of success':'Results',section:'Performance',heading:id==='proposal'?'How we’ll know it works.':'A result with context.',body:'Define the metric, baseline, and measurement period.',purpose:'Support the outcome with a comparable editable chart'},
    table:{name:id==='pitch'?'Economics':id==='proposal'?'Scope and estimates':id==='review'?'Decision criteria':'Comparison table',section:'The details',heading:id==='pitch'?'The model, in numbers.':id==='proposal'?'Scope, effort, and value.':'Compare on equal terms.',body:'',purpose:'Evaluate comparable options with an editable table'},
    quote:{name:'A voice from the audience',section:'Perspective',heading:'“Add a real observation\nfrom your audience.”',body:'Name · Role or context',purpose:'Give a human perspective to the supporting evidence'},
    roadmap:{name:id==='proposal'?'Approval gates':'Priorities',section:'Next steps',heading:id==='proposal'?'What needs approval.':'What happens next.',body:'',purpose:'Set priorities, ownership, and the next decision',columns:t.milestones.slice(0,3)},
    close:{name:'Closing',section:'Next step',heading:'A clear\nnext step.',body:'Name the action, its owner, and the next conversation.',purpose:'Leave the audience with one explicit next action'},
  } satisfies Record<string,TemplatePage>);
  if(id==='report')out.gallery={name:'Print and material studies',section:'Material studies',heading:'Report folio and material studies.',body:'',purpose:'Inspect AI print and material concepts separately from data evidence',fields:[['Open folio','AI print concept · A quiet report structure'],['Binding detail','AI material concept · Construction and precision'],['Closed edition','AI print concept · Format and proportion']]};
  return out;
}
