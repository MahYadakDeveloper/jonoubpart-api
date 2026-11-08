import {
  CustomerAddress,
  CustomerAddressApi,
} from '@feature/actors-api/customer';
import { Injectable } from '@nestjs/common';
import { AddressRepository } from './address.repository';

export type AddressDto = CustomerAddress;

@Injectable()
export class AddressService implements CustomerAddressApi {
  constructor(private readonly repository: AddressRepository) {}

  findManyByCustomerId(customerId: string): Promise<CustomerAddress[]> {
    return this.repository.findManyByCustomerId(customerId);
  }

  findByIdAndCustomerId(
    addressId: string,
    customerId: string,
  ): Promise<CustomerAddress> {
    return this.repository
      .findByIdAndCustomerId(addressId, customerId)
      .then((a) => {
        if (!a) throw new Error();
        return a;
      });
  }

  async create(customerId: string, address: CustomerAddress): Promise<void> {
    await this.repository.create(customerId, address);
  }

  updateByCustomerIdAndId(req: {
    customerId: string;
    addressId: string;
    data: Omit<AddressDto, 'id'>;
  }): Promise<void> {
    return this.repository.updateByCustomerIdAndId(
      req.customerId,
      req.addressId,
      req.data,
    );
  }

  deleteByCustomerIdAndId({
    addressId,
    customerId,
  }: {
    customerId: string;
    addressId: string;
  }): Promise<void> {
    return this.repository.deleteByCustomerIdAndId(customerId, addressId);
  }
}
