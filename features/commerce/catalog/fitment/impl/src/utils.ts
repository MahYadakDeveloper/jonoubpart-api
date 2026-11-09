import {
  FitmentMakeNode,
  FitmentNode,
} from '@feature/catalog.fitment.node-api';

export function* ancestors(
  node: FitmentNode | FitmentMakeNode,
): Generator<FitmentNode | FitmentMakeNode> {
  let current: FitmentNode | FitmentMakeNode = node;

  while (true) {
    yield current;

    if (current.type === 'make') {
      break;
    }

    current = current.parent;
  }
}
