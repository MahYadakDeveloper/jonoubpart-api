import {
  FitmentNode,
  type FitmentNodeApi,
} from '@feature/catalog.fitment.node-api';
import { OutboxRepository, TransactionManager } from '@feature/shared';
import {
  FindFitmentRequest,
  FindFitmentResponse,
  FindManyFitmentRequest,
  FindManyFitmentResponse,
  FitmentApi,
  FitmentDeletedEventPayload,
  FitmentDto,
  FitmentManyDeletedEventType,
  FitmentManyUpdatedEventType,
  FitmentUpdatedEventPayload,
} from '@feature/fitment-api';
import {
  FitmentCreationRequest,
  FitmentDeletionRequest,
  FitmentUpdatingRequest,
} from './fitment.req';
import { FitmentCreationResponse } from './fitment.res';
import { Fitment } from './model/fitment';
import { FitmentRepository } from './repository/fitment.repository';
import { ancestors } from './utils';

export class FitmentService implements FitmentApi {
  constructor(
    private readonly repository: FitmentRepository,
    private readonly node: FitmentNodeApi,
    private readonly tx: TransactionManager,
    private readonly outbox: OutboxRepository,
  ) {}

  async find({ fitmentId }: FindFitmentRequest): Promise<FindFitmentResponse> {
    const fitment = await this.repository.find(fitmentId);

    if (fitment === null) throw new Error(`Not found fitment ${fitmentId}`);

    const { node } = await this.node.find({ nodeId: fitment.nodeReference });

    return {
      fitment: this.toDto(fitment, node),
    };
  }

  async findMany({
    fitmentIds,
  }: FindManyFitmentRequest): Promise<FindManyFitmentResponse> {
    const fitments = await this.repository.findMany(fitmentIds);

    const { nodes } = await this.node.findMany({
      nodeIds: [
        ...fitments
          .transform(
            (fitment) => fitment.nodeReference,
            (x) => x,
          )
          .keys(),
      ],
    });

    const fitmentDto_s = fitments.transform(
      (fitment) => this.toDto(fitment, nodes.getOrThrow(fitment.nodeReference)),
      (x) => x.id,
    );

    return { fitments: fitmentDto_s };
  }

  /**
   * [NOTE]
   * This method only validates that the referenced hierarchy node exists.
   * Validation of the model year (e.g. Persian or Gregorian calendar) is
   * intentionally delegated to higher layers such as controllers.
   */
  async create({
    fitmentDto,
  }: FitmentCreationRequest): Promise<FitmentCreationResponse> {
    const { node } = await this.node.find({ nodeId: fitmentDto.nodeReference });

    const id = await this.repository.create({
      nodeReference: node.id,
      modelYearRange: fitmentDto.modelYearRange,
    });

    return { fitmentId: id };
  }
  async update({
    fitmentId,
    fitmentDto,
  }: FitmentUpdatingRequest): Promise<void> {
    const fitment = await this.repository.find(fitmentId);

    if (fitment === null) throw new Error(`Not found fitment ${fitmentId}`);

    const { node } = await this.node.find({ nodeId: fitmentDto.nodeReference });

    await this.tx.run(async () => {
      await this.repository.update(fitmentId, {
        nodeReference: node.id,
        modelYearRange: fitmentDto.modelYearRange,
      });

      await this.outbox.save({
        type: FitmentManyUpdatedEventType,
        payload: { fitmentsId: fitmentId } satisfies FitmentUpdatedEventPayload,
      });
    });
  }

  async delete({ fitmentId }: FitmentDeletionRequest): Promise<void> {
    await this.tx.run(async () => {
      await this.repository.delete(fitmentId);

      await this.outbox.save({
        type: FitmentManyDeletedEventType,
        payload: { fitmentsId: fitmentId } satisfies FitmentDeletedEventPayload,
      });
    });
  }

  /**
   * Mapper
   */
  private toDto(fitment: Fitment, node: FitmentNode): FitmentDto {
    const result: Partial<FitmentDto> = {
      id: fitment.id,
      modelYearRange: fitment.modelYearRange,
    };

    for (const current of ancestors(node)) {
      switch (current.type) {
        case 'make':
          result.make = {
            name: current.name,
            logo: current.logo,
          };
          break;
        case 'model':
          result.model = {
            name: current.name,
            image: current.image,
          };
          break;
        default:
          result[current.type] = current.name;
      }
    }

    return result as FitmentDto;
  }
}
