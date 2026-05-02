# Elixir test file
defmodule CodeBrain.User do
  @moduledoc """
  User module for managing user data
  """

  defstruct [:id, :name, :email]

  @type t :: %__MODULE__{
    id: integer(),
    name: String.t(),
    email: String.t()
  }

  def new(id, name, email) do
    %__MODULE__{id: id, name: name, email: email}
  end

  def display_name(%__MODULE__{name: name, email: email}) do
    "#{name} (#{email})"
  end
end

defmodule CodeBrain.UserService do
  @moduledoc """
  Service for user operations
  """

  alias CodeBrain.User

  def create_user(name, email) do
    User.new(1, name, email)
  end

  def get_user(id) do
    # Implementation here
    nil
  end

  defp validate_email(email) do
    String.contains?(email, "@")
  end
end
