import plistlib, uuid, sys, os
out = sys.argv[1]
FILE = 'wa_until.txt'
FMT = 'yyyyMMddHHmmss'  # sortable number, local time; same in both shortcuts
PAUSE_URL = 'https://logicscooking.github.io/winter-arc/#/pause?app=instagram'

def U(): return str(uuid.uuid4()).upper()
def att(uid, name): return {'Value': {'OutputUUID': uid, 'Type': 'ActionOutput', 'OutputName': name}, 'WFSerializationType': 'WFTextTokenAttachment'}
def tok(uid, name): return {'Value': {'string': '\ufffc', 'attachmentsByRange': {'{0, 1}': {'OutputUUID': uid, 'Type': 'ActionOutput', 'OutputName': name}}}, 'WFSerializationType': 'WFTextTokenString'}
def txt(s): return {'Value': {'string': s, 'attachmentsByRange': {}}, 'WFSerializationType': 'WFTextTokenString'}
def act(ident, uid=None, **p):
    if uid: p['UUID'] = uid
    return {'WFWorkflowActionIdentifier': ident, 'WFWorkflowActionParameters': p}
def now_number():
    d, f, n = U(), U(), U()
    return n, [
        act('is.workflow.actions.date', d, WFDateActionMode='Current Date'),
        act('is.workflow.actions.format.date', f, WFDateFormatStyle='Custom', WFDateFormat=FMT, WFDate=tok(d, 'Date')),
        act('is.workflow.actions.detect.number', n, WFInput=att(f, 'Formatted Date')),
    ]
def base(name, actions, **extra):
    d = {
        'WFWorkflowName': name,
        'WFWorkflowActions': actions,
        'WFWorkflowClientVersion': '2302.0.4',
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowIcon': {'WFWorkflowIconStartColor': 463140863, 'WFWorkflowIconGlyphNumber': 59511},
        'WFWorkflowImportQuestions': [],
        'WFWorkflowTypes': [],
        'WFQuickActionSurfaces': [],
        'WFWorkflowInputContentItemClasses': ['WFStringContentItem'],
        'WFWorkflowOutputContentItemClasses': [],
        'WFWorkflowHasOutputFallback': False,
        'WFWorkflowHasShortcutInputVariables': False,
    }
    d.update(extra)
    return d

def dbg_url():
    # the pause URL plus what was compared, so a failing check is visible on the pause screen
    a = PAUSE_URL + '&u='
    b = a + '\ufffc&n='
    return {'Value': {'string': b + '\ufffc', 'attachmentsByRange': {
        '{%d, 1}' % len(a): {'OutputUUID': ft, 'Type': 'ActionOutput', 'OutputName': 'Text'},
        '{%d, 1}' % len(b): {'OutputUUID': nn, 'Type': 'ActionOutput', 'OutputName': 'Numbers'}}},
        'WFSerializationType': 'WFTextTokenString'}

# ---- WA Пауза: open the pause page unless an «entered» window is active
gf, ft, un, g, url = U(), U(), U(), U(), U()
nn, now_acts = now_number()
pause = [
    act('is.workflow.actions.comment', WFCommentActionText='Winter Arc. Запускается автоматизацией «Instagram открыт». Если после «Захожу» окно ещё идёт — ничего не делает, иначе открывает паузу.'),
    act('is.workflow.actions.documentpicker.open', gf, WFShowFilePicker=False, WFGetFilePath=txt(FILE), WFFileErrorIfNotFound=False),
    act('is.workflow.actions.detect.text', ft, WFInput=att(gf, 'File')),
    act('is.workflow.actions.detect.number', un, WFInput=att(ft, 'Text')),
    *now_acts,
    act('is.workflow.actions.conditional', g, GroupingIdentifier=g, WFControlFlowMode=0, WFCondition=2,
        WFInput={'Type': 'Variable', 'Variable': {'Value': {'OutputUUID': nn, 'Type': 'ActionOutput', 'OutputName': 'Numbers',
                 'Aggrandizements': [{'Type': 'WFCoercionVariableAggrandizement', 'CoercionItemClass': 'WFNumberContentItem'}]},
                 'WFSerializationType': 'WFTextTokenAttachment'}},
        WFNumberValue=att(un, 'Numbers')),
    act('is.workflow.actions.url', url, WFURLActionURL=dbg_url()),
    act('is.workflow.actions.openurl', WFInput=att(url, 'URL'), Show=True),
    act('is.workflow.actions.conditional', GroupingIdentifier=g, WFControlFlowMode=1),
    act('is.workflow.actions.comment', WFCommentActionText='Окно «Захожу» ещё идёт — не мешаем.'),
    act('is.workflow.actions.conditional', GroupingIdentifier=g, WFControlFlowMode=2),
]

# ---- WA Захожу: input = window end as yyyyMMddHHmmss (the page computes it); save it, then open Instagram
tx, sv, iu = U(), U(), U()
enter = [
    act('is.workflow.actions.comment', WFCommentActionText='Winter Arc. Вход: до какого времени пауза не мешает (число вида 20261123103500, его считает сайт). Запоминает и открывает Instagram.'),
    act('is.workflow.actions.gettext', tx, WFTextActionText={'Value': {'string': '\ufffc', 'attachmentsByRange': {'{0, 1}': {'Type': 'ExtensionInput'}}}, 'WFSerializationType': 'WFTextTokenString'}),
    act('is.workflow.actions.documentpicker.save', sv, WFInput=att(tx, 'Text'), WFAskWhereToSave=False,
        WFSaveFileOverwrite=True, WFFileDestinationPath=txt(FILE)),
    act('is.workflow.actions.url', iu, WFURLActionURL='instagram://'),
    act('is.workflow.actions.openurl', WFInput=att(iu, 'URL'), Show=True),
]

for name, actions, extra in [
    ('WA Пауза', pause, {}),
    ('WA Захожу', enter, {'WFWorkflowHasShortcutInputVariables': True,
        'WFWorkflowNoInputBehavior': {'Name': 'WFWorkflowNoInputBehaviorAskForInput', 'Parameters': {'ItemClass': 'WFStringContentItem'}}}),
]:
    with open(os.path.join(out, name + '.unsigned.shortcut'), 'wb') as fh:
        plistlib.dump(base(name, actions, **extra), fh, fmt=plistlib.FMT_BINARY)
