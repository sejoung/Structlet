export const diagramViewEn = {
  'diagramContent.all': 'Full diagram',
  'diagramContent.flow': 'Service flow',
  'diagramContent.operations': 'Operations',
  'diagramContent.hint': 'Switch to Full diagram to edit.',
  'diagramSummary.recommend': 'Apply recommended summary',
  'diagramSummary.applied': 'Applied the recommended summary for this canvas.',
  'diagramSummary.expanded': 'The expanded diagram is recommended at this size.',
  'diagramSummary.layoutFolded': 'Auto-layout with groups collapsed',
} as const;

export const diagramViewKo: Record<keyof typeof diagramViewEn, string> = {
  'diagramContent.all': '전체 보기',
  'diagramContent.flow': '서비스 흐름',
  'diagramContent.operations': '운영 구성',
  'diagramContent.hint': '편집하려면 전체 보기로 전환하세요.',
  'diagramSummary.recommend': '추천 요약 적용',
  'diagramSummary.applied': '현재 화면 크기에 맞는 추천 요약을 적용했습니다.',
  'diagramSummary.expanded': '현재 화면 크기에서는 펼쳐 보기를 추천합니다.',
  'diagramSummary.layoutFolded': '접힌 그룹 단위로 자동 배치',
};
