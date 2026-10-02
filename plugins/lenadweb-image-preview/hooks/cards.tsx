import type { Elements } from 'claude-code'

import type { Picture } from '../types'

type CardElements = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Raster' | 'Image'>

type ClipboardActions = {
  onOpen: () => void
  onHide: () => void
}

export function renderClipboardCard(ui: CardElements, picture: Picture, showsPixels: boolean, actions: ClipboardActions) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} alignSelf="flex-start">
      {renderPicture(ui, 'clipboard', picture, showsPixels)}
      <Box flexDirection="row" gap={1}>
        <Text bold>Clipboard</Text>
        <Text dimColor>{`${picture.width}×${picture.height} · ${picture.format}`}</Text>
        <Text dimColor>·</Text>
        <Text color="suggestion">ctrl+v</Text>
        <Text dimColor>to paste</Text>
        <Button key="open" label="↗ Open" plain dimColor hotkey="o" onPress={actions.onOpen} />
        <Button key="hide" label="✕ Hide" plain dimColor hotkey="h" onPress={actions.onHide} />
      </Box>
    </Box>
  )
}

export function renderThumbnails(
  ui: CardElements,
  thumbnails: [string, Picture][],
  showsPixels: boolean,
  onOpen: (picture: Picture) => void,
) {
  const { Box } = ui
  return (
    <Box flexDirection="row" gap={1} flexWrap="wrap">
      {thumbnails.map(([number, picture]) => renderThumbnail(ui, number, picture, showsPixels, onOpen))}
    </Box>
  )
}

function renderThumbnail(
  ui: CardElements,
  number: string,
  picture: Picture,
  showsPixels: boolean,
  onOpen: (picture: Picture) => void,
) {
  const { Box, Text, Button } = ui
  const hotkey = Number(number) < 10 ? number : undefined
  return (
    <Box key={`thumbnail-${number}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
      {renderPicture(ui, `thumbnail-${number}`, picture, showsPixels)}
      <Box flexDirection="row" gap={1}>
        <Text color="suggestion" bold>{`#${number}`}</Text>
        <Text dimColor wrap="truncate-end">{`${picture.width}×${picture.height}`}</Text>
        <Button key={`open-${number}`} label="↗ Open" plain dimColor hotkey={hotkey} onPress={() => onOpen(picture)} />
      </Box>
    </Box>
  )
}

function renderPicture(ui: CardElements, key: string, picture: Picture, showsPixels: boolean) {
  const { Raster, Image } = ui
  if (showsPixels || !picture.cells) {
    const source = { file: picture.file, format: 'png' as const }
    return <Image key={key} source={source} columns={picture.columns} rows={picture.rows} alt={key} />
  }
  return <Raster key={key} columns={picture.columns} rows={picture.rows} cells={picture.cells} />
}
