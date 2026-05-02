# Ruby test file
require 'json'

class User
  attr_accessor :id, :name, :email

  def initialize(id, name, email)
    @id = id
    @name = name
    @email = email
  end

  def display_name
    "#{@name} (#{@email})"
  end

  def to_json(*args)
    {
      id: @id,
      name: @name,
      email: @email
    }.to_json(*args)
  end
end

module UserService
  def self.create_user(name, email)
    User.new(1, name, email)
  end

  def self.find_user(id)
    # Implementation here
  end
end

# Usage
user = UserService.create_user("John", "john@example.com")
puts user.display_name
